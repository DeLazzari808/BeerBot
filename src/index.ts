import { config } from './config/env.js';
import { isSupabaseConfigured, testSupabaseConnection } from './database/supabase.js';
import { connectWhatsApp, setMessageHandler, setDeleteHandler } from './services/whatsapp.js';
import { handleMessage } from './handlers/message.handler.js';
import { handleDelete } from './handlers/delete.handler.js';
import { startDailyRecapScheduler, stopDailyRecapScheduler } from './services/scheduler.js';
import { counterService } from './core/counter.js';
import { userRepository } from './database/repositories/user.repo.js';
import { logger } from './utils/logger.js';

let isShuttingDown = false;

async function main(): Promise<void> {
    logger.info({ event: 'bot_starting' });

    // Verifica se Supabase está configurado
    if (!isSupabaseConfigured()) {
        logger.error({ event: 'supabase_not_configured' });
        console.error('❌ Supabase não configurado! Configure SUPABASE_URL e SUPABASE_KEY no .env');
        process.exit(1);
    }

    // Testa conexão com Supabase
    const connected = await testSupabaseConnection();
    if (!connected) {
        logger.error({ event: 'supabase_connection_failed' });
        console.error('❌ Não foi possível conectar ao Supabase!');
        process.exit(1);
    }
    logger.info({ event: 'supabase_connected' });

    // Verifica e corrige inconsistências de contagem no startup
    const fixedUsers = await userRepository.checkAndFixConsistency();
    if (fixedUsers > 0) {
        logger.warn({ event: 'startup_consistency_fix', usersFixed: fixedUsers });
        console.log(`⚠️ Corrigidas inconsistências em ${fixedUsers} usuário(s)`);
    }

    // Verifica se precisa definir contagem inicial
    const currentCount = await counterService.getCurrentCount();
    if (currentCount === 0 && config.initialCount > 0) {
        await counterService.setInitialCount(config.initialCount, 'system', 'Sistema');
        logger.info({ event: 'initial_count_set', count: config.initialCount });
    }

    logger.info({ event: 'current_count', count: await counterService.getCurrentCount() });

    // Registra handlers
    setMessageHandler(handleMessage);
    setDeleteHandler(handleDelete);

    // Conecta ao WhatsApp
    await connectWhatsApp();

    // Inicia scheduler do recap diário (23:45)
    startDailyRecapScheduler();

    logger.info({ event: 'bot_ready' });
    console.log('✅ Bot inicializado! Aguardando mensagens...');

    // Graceful shutdown
    const shutdown = async (signal: string) => {
        if (isShuttingDown) {
            logger.warn({ event: 'shutdown_already_in_progress' });
            return;
        }

        isShuttingDown = true;
        logger.info({ event: 'shutdown_started', signal });
        console.log(`\n👋 Recebido ${signal}. Encerrando bot...`);

        // Para o scheduler
        stopDailyRecapScheduler();

        // Aguarda um pouco para operações pendentes terminarem
        await new Promise(resolve => setTimeout(resolve, 1000));

        logger.info({ event: 'shutdown_complete' });
        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handler para erros não tratados
    process.on('uncaughtException', (error) => {
        logger.error({ event: 'uncaught_exception', error: error.message, stack: error.stack });
        shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
        logger.error({ event: 'unhandled_rejection', reason: String(reason) });
    });
}

main().catch((error) => {
    logger.error({ event: 'fatal_error', error: error.message, stack: error.stack });
    console.error('Erro fatal:', error);
    process.exit(1);
});

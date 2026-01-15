import { config } from './config/env.js';
import { isSupabaseConfigured, testSupabaseConnection } from './database/supabase.js';
import { connectWhatsApp, setMessageHandler, setDeleteHandler } from './services/whatsapp.js';
import { handleMessage } from './handlers/message.handler.js';
import { handleDelete } from './handlers/delete.handler.js';
import { startDailyRecapScheduler, stopDailyRecapScheduler } from './services/scheduler.js';
import { counterService } from './core/counter.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
    logger.info('🍺 Iniciando BeerBot...');

    // Verifica se Supabase está configurado
    if (!isSupabaseConfigured()) {
        logger.error('❌ Supabase não configurado! Configure SUPABASE_URL e SUPABASE_KEY no .env');
        process.exit(1);
    }

    // Testa conexão com Supabase
    const connected = await testSupabaseConnection();
    if (!connected) {
        logger.error('❌ Não foi possível conectar ao Supabase!');
        process.exit(1);
    }
    logger.info('✅ Conectado ao Supabase');

    // Verifica se precisa definir contagem inicial
    const currentCount = await counterService.getCurrentCount();
    if (currentCount === 0 && config.initialCount > 0) {
        await counterService.setInitialCount(config.initialCount, 'system', 'Sistema');
        logger.info(`📊 Contagem inicial definida: ${config.initialCount}`);
    }

    logger.info(`📊 Contagem atual: ${await counterService.getCurrentCount()}`);

    // Registra handlers
    setMessageHandler(handleMessage);
    setDeleteHandler(handleDelete);

    // Conecta ao WhatsApp
    await connectWhatsApp();

    // Inicia scheduler do recap diário (23:45)
    startDailyRecapScheduler();

    logger.info('✅ Bot inicializado! Aguardando mensagens...');

    // Graceful shutdown
    const shutdown = () => {
        logger.info('👋 Encerrando bot...');
        stopDailyRecapScheduler();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((error) => {
    logger.error({ error }, 'Erro fatal');
    process.exit(1);
});

import { proto } from '@whiskeysockets/baileys';
import { config } from '../config/env.js';
import { counterService } from '../core/counter.js';
import { getElo, ELOS } from '../core/elo.js';
import { countRepository } from '../database/repositories/count.repo.js';
import { userRepository } from '../database/repositories/user.repo.js';
import { sendMessage, replyToMessage } from '../services/whatsapp.js';
import { logger } from '../utils/logger.js';
import {
    COOLDOWN_MS,
    COOLDOWN_CLEANUP_INTERVAL_MS,
    STATS_UNLOCK_HOUR,
    MAX_COUNT_VALUE,
    MIN_COUNT_VALUE,
    GOAL,
} from '../config/constants.js';
import { getDonateMessage, maybeGetDonateHint } from '../config/donate.js';

// Rate limiting
const userCommandCooldowns = new Map<string, number>();

// Rate limit específico para /ranking (1 hora)
const RANKING_COOLDOWN_MS = 60 * 60 * 1000; // 1 hora
const rankingCooldowns = new Map<string, number>();

// Limpeza periódica do Map de cooldowns para evitar memory leak
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [userId, timestamp] of userCommandCooldowns.entries()) {
        if (now - timestamp > COOLDOWN_MS) {
            userCommandCooldowns.delete(userId);
            cleaned++;
        }
    }
    // Limpa também cooldowns de ranking
    for (const [userId, timestamp] of rankingCooldowns.entries()) {
        if (now - timestamp > RANKING_COOLDOWN_MS) {
            rankingCooldowns.delete(userId);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        logger.debug({ event: 'cooldown_cleanup', cleaned });
    }
}, COOLDOWN_CLEANUP_INTERVAL_MS);

/**
 * Verifica se está no horário liberado para comandos de estatísticas
 * Antes das 18h, os comandos de ranking ficam bloqueados
 */
function isStatsTimeAllowed(): boolean {
    const now = new Date();
    const hour = now.getHours();
    return hour >= STATS_UNLOCK_HOUR;
}

/**
 * Mensagem amigável para quando os comandos estão bloqueados
 */
const STATS_BLOCKED_MESSAGE =
    `🍺 *Calma, cervejeiro!* 🍺\n\n` +
    `Vai bebendo que depois das *${STATS_UNLOCK_HOUR}h* eu te conto como a gente tá! 📊\n\n` +
    `_Bot ainda em desenvolvimento_ 🛠️`;

/**
 * Verifica se o usuário é admin
 * Aceita formato antigo (número) ou novo (ID completo)
 */
function isAdmin(userId: string): boolean {
    // Remove sufixos para comparação
    const cleanId = userId.replace('@s.whatsapp.net', '').replace('@lid', '');

    // Verifica se bate com algum admin (número ou ID completo)
    return config.adminNumbers.some(admin => {
        const cleanAdmin = admin.replace('@s.whatsapp.net', '').replace('@lid', '');
        return cleanId === cleanAdmin || userId === admin;
    });
}

/**
 * Verifica se o usuário está em cooldown
 */
function checkRateLimit(userId: string): { allowed: boolean; waitTime?: number } {
    if (isAdmin(userId)) return { allowed: true };

    const lastUsed = userCommandCooldowns.get(userId);
    const now = Date.now();

    if (lastUsed && now - lastUsed < COOLDOWN_MS) {
        const waitTime = Math.ceil((COOLDOWN_MS - (now - lastUsed)) / 60000);
        return { allowed: false, waitTime };
    }

    userCommandCooldowns.set(userId, now);
    return { allowed: true };
}

// Lista de comandos públicos para rate limiting
const PUBLIC_COMMANDS = ['status', 's', 'rank', 'ranking', 'top', 'elo', 'elos', 'help', 'ajuda', 'comandos', 'hoje', 'semana', 'week', 'donate', 'pix', 'doar'];

// Lista de comandos válidos para detectar comandos desconhecidos
const VALID_COMMANDS = [...PUBLIC_COMMANDS, 'audit', 'auditoria', 'setcount', 'iniciar', 'fix', 'forcar', 'recap', 'recalc', 'sync', 'del', 'deletar', 'setuser'];

/**
 * Handler de comandos
 */
export async function handleCommand(
    message: proto.IWebMessageInfo,
    text: string,
    senderId: string,
    senderName: string,
    jid: string
): Promise<void> {
    const parts = text.slice(1).trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    logger.info({ event: 'command_received', command, args, sender: senderName, senderId });

    // Verifica se é um comando válido
    if (!VALID_COMMANDS.includes(command)) {
        // Comando não reconhecido - dá feedback amigável
        logger.debug({ event: 'unknown_command', command });
        await replyToMessage(
            jid,
            `❓ Comando */${command}* não reconhecido.\n\nUse */help* para ver os comandos disponíveis. 🍺`,
            message
        );
        return;
    }

    // Verifica rate limit para comandos públicos
    if (PUBLIC_COMMANDS.includes(command)) {
        const { allowed, waitTime } = checkRateLimit(senderId);
        if (!allowed) {
            await replyToMessage(jid, `⏳ *Calma lá!* Você só pode usar comandos a cada ${Math.ceil(COOLDOWN_MS / 60000)} minutos.\nTente novamente em ${waitTime} min. 🍺`, message);
            return;
        }
    }

    try {
        switch (command) {
            case 'status':
            case 's':
                await handleStatus(jid);
                break;

            case 'rank':
            case 'ranking':
            case 'top':
                // Ranking só depois das 18h para não-admins
                if (!isAdmin(senderId) && !isStatsTimeAllowed()) {
                    await replyToMessage(jid, STATS_BLOCKED_MESSAGE, message);
                    break;
                }
                // Rate limit específico de 1 hora para ranking
                if (!isAdmin(senderId)) {
                    const lastRanking = rankingCooldowns.get(senderId);
                    const now = Date.now();
                    if (lastRanking && now - lastRanking < RANKING_COOLDOWN_MS) {
                        const waitMins = Math.ceil((RANKING_COOLDOWN_MS - (now - lastRanking)) / 60000);
                        await replyToMessage(jid, `⏳ *Ei!* O /ranking só pode ser usado 1x por hora.\nTente novamente em ${waitMins} min. 🍺`, message);
                        break;
                    }
                    rankingCooldowns.set(senderId, now);
                }
                await handleRanking(jid);
                break;


            case 'elo':
            case 'elos':
                await handleElos(jid);
                break;

            case 'hoje':
                await handleToday(jid);
                break;

            case 'semana':
            case 'week':
                await handleWeek(jid);
                break;

            case 'donate':
            case 'pix':
            case 'doar':
                await handleDonate(jid);
                break;

            case 'audit':
            case 'auditoria':
                if (!isAdmin(senderId)) {
                    logger.warn({ event: 'admin_command_denied', command, senderId });
                    await replyToMessage(jid, '❌ Apenas admins podem usar este comando.', message);
                    break;
                }
                await handleAudit(jid);
                break;

            case 'help':
            case 'ajuda':
            case 'comandos':
                await handleHelp(jid, isAdmin(senderId));
                break;

            case 'setcount':
            case 'iniciar':
                await handleSetCount(jid, args, senderId, senderName, message);
                break;

            case 'fix':
            case 'forcar':
                await handleForceCount(jid, args, senderId, senderName, message);
                break;

            case 'recap':
                if (!isAdmin(senderId)) {
                    logger.warn({ event: 'admin_command_denied', command, senderId });
                    await replyToMessage(jid, '❌ Apenas admins podem usar este comando.', message);
                    break;
                }
                logger.info({ event: 'admin_command_executed', command, senderId });
                // Importa e executa o recap dinamicamente
                const { sendDailyRecap } = await import('../services/scheduler.js');
                await sendDailyRecap();
                break;

            case 'recalc':
            case 'sync':
                await handleRecalc(jid, senderId, message);
                break;

            case 'del':
            case 'deletar':
                await handleDeleteCount(jid, args, senderId, message);
                break;

            case 'setuser':
                await handleSetUser(jid, args, senderId, message);
                break;

            default:
                // Não deve chegar aqui devido à verificação anterior
                break;
        }
    } catch (error) {
        logger.error({ event: 'command_error', command, error: error instanceof Error ? error.message : String(error) });
        await replyToMessage(jid, '❌ Ocorreu um erro ao processar o comando. Tente novamente.', message);
    }
}

async function handleRecalc(
    jid: string,
    senderId: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    if (!isAdmin(senderId)) {
        logger.warn({ event: 'admin_command_denied', command: 'recalc', senderId });
        await replyToMessage(jid, '❌ Apenas admins podem usar este comando.', message);
        return;
    }

    logger.info({ event: 'admin_command_executed', command: 'recalc', senderId });
    await replyToMessage(jid, '🔄 Recalculando estatísticas... aguarde.', message);

    try {
        const count = await userRepository.recalculateAll();
        await sendMessage(jid, `✅ Sincronização concluída!\n\n👥 ${count} usuários atualizados com base no histórico de cervejas.`);
        logger.info({ event: 'recalc_complete', usersUpdated: count, executedBy: senderId });
    } catch (error) {
        logger.error({ event: 'recalc_error', error: error instanceof Error ? error.message : String(error), executedBy: senderId });
        await replyToMessage(jid, `❌ Erro ao recalcular estatísticas: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, message);
    }
}

async function handleStatus(jid: string): Promise<void> {
    const progress = await counterService.getProgress();
    const participants = await userRepository.getTotalParticipants();

    const remaining = progress.goal - progress.current;
    const beersPerDay = Math.ceil(remaining / getDaysRemaining());

    const text =
        `🍺 *STATUS DA CONTAGEM* 🍺\n\n` +
        `📊 Atual: *${formatNumber(progress.current)}* cervejas\n` +
        `🎯 Meta: *${formatNumber(progress.goal)}* cervejas\n` +
        `📈 Progresso: *${progress.percentage}%*\n` +
        `⏳ Faltam: *${formatNumber(remaining)}* cervejas\n` +
        `👥 Participantes: *${participants}*\n\n` +
        `📅 Média necessária: *${formatNumber(beersPerDay)}/dia*` +
        maybeGetDonateHint();

    await sendMessage(jid, text);
}

async function handleRanking(jid: string): Promise<void> {
    const top = await userRepository.getTopN(10);

    if (top.length === 0) {
        await sendMessage(jid, '📊 Nenhuma contagem registrada ainda!');
        return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = top.map((user, i) => {
        const medal = medals[i] || `${i + 1}.`;
        const elo = getElo(user.totalCount);
        return `${medal} *${user.name || 'Anônimo'}* — ${user.totalCount} 🍺 ${elo.emoji}`;
    });

    const text =
        `🏆 *TOP 10 BEBEDORES* 🏆\n\n` +
        lines.join('\n') +
        `\n\n_Use /elo para ver todos os ranks_` +
        maybeGetDonateHint();

    await sendMessage(jid, text);
}

async function handleElos(jid: string): Promise<void> {
    const lines = ELOS.map(elo => {
        const range = elo.maxCount === Infinity
            ? `${elo.minCount}+`
            : `${elo.minCount}-${elo.maxCount}`;
        return `${elo.emoji} *${elo.name}* — ${range} 🍺`;
    });

    const text =
        `🎖️ *SISTEMA DE ELOS* 🎖️\n\n` +
        lines.join('\n') +
        `\n\n_Suba de elo bebendo mais! 🍺_`;

    await sendMessage(jid, text);
}

async function handleToday(jid: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const stats = await countRepository.getDailyStats(today);

    if (stats.total === 0) {
        await sendMessage(jid, '📊 *HOJE* 📊\n\nNenhuma cerveja registrada ainda hoje! 🍺');
        return;
    }

    const topLines = stats.topContributors.slice(0, 3).map((c, i) => {
        const medals = ['🥇', '🥈', '🥉'];
        return `${medals[i]} ${c.userName} — ${c.count}`;
    });

    const text =
        `📊 *HOJE* 📊\n\n` +
        `🍺 Cervejas: *${stats.total}*\n` +
        `📈 Range: #${stats.startNumber} → #${stats.endNumber}\n` +
        `👥 Participantes: *${stats.topContributors.length}*\n\n` +
        `🏆 *Top 3:*\n${topLines.join('\n')}`;

    await sendMessage(jid, text);
}

async function handleWeek(jid: string): Promise<void> {
    const stats = await countRepository.getWeeklyStats();

    if (stats.total === 0) {
        await sendMessage(jid, '📊 *SEMANA* 📊\n\nNenhuma cerveja registrada nos últimos 7 dias! 🍺');
        return;
    }

    const topLines = stats.topContributors.slice(0, 5).map((c, i) => {
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        const percentage = ((c.count / stats.total) * 100).toFixed(0);
        return `${medals[i]} ${c.userName} — ${c.count} (${percentage}%)`;
    });

    // Formata breakdown diário (com emoji de dia da semana)
    const dayEmojis: { [key: string]: string } = {
        '0': '🌙', // Domingo
        '1': '📅', // Segunda
        '2': '📅', // Terça
        '3': '📅', // Quarta
        '4': '📅', // Quinta
        '5': '🎉', // Sexta
        '6': '🍻', // Sábado
    };

    const dailyLines = stats.dailyBreakdown.map(d => {
        const date = new Date(d.date + 'T12:00:00');
        const dayOfWeek = date.getDay().toString();
        const dayName = date.toLocaleDateString('pt-BR', { weekday: 'short' });
        const dayNum = date.getDate().toString().padStart(2, '0');
        return `${dayEmojis[dayOfWeek]} ${dayName} ${dayNum}: *${d.count}*`;
    });

    const text =
        `📊 *ÚLTIMA SEMANA* 📊\n\n` +
        `🍺 Total: *${stats.total}* cervejas\n` +
        `📈 Range: #${stats.startNumber} → #${stats.endNumber}\n` +
        `📅 Média diária: *${stats.dailyAverage}*/dia\n` +
        `👥 Participantes: *${stats.topContributors.length}*\n\n` +
        `🏆 *Top 5 da Semana:*\n${topLines.join('\n')}\n\n` +
        `📆 *Por Dia:*\n${dailyLines.join('\n')}`;

    await sendMessage(jid, text);
}

async function handleAudit(jid: string): Promise<void> {
    const last = await countRepository.getLastN(15);

    if (last.length === 0) {
        await sendMessage(jid, '📋 Nenhuma contagem registrada ainda!');
        return;
    }

    const lines = last.map(c =>
        `${c.number}. ${c.userName || 'Anônimo'} ${c.hasImage ? '📸' : ''}`
    );

    const text =
        `📋 *ÚLTIMAS 15 CONTAGENS* 📋\n\n` +
        lines.join('\n');

    await sendMessage(jid, text);
}

async function handleHelp(jid: string, isUserAdmin: boolean): Promise<void> {
    let text =
        `🍺 *COMANDOS DO BOT* 🍺\n\n` +
        `*/status* (ou */s*) — Ver contagem atual\n` +
        `*/rank* — Top 10 bebedores\n` +
        `*/elo* — Ver sistema de elos\n` +
        `*/hoje* — Estatísticas de hoje\n` +
        `*/semana* — Estatísticas da semana\n` +
        `*/pix* — Pagar uma gelada pro bot 🍻\n` +
        `*/help* — Esta mensagem\n\n` +
        `📝 *COMO CONTAR*\n` +
        `Envie uma foto da cerveja! O bot conta automaticamente.\n` +
        `Você pode adicionar o número na legenda se quiser.\n\n` +
        `🎖️ *SISTEMA DE ELOS*\n` +
        `Quanto mais cervejas, maior seu elo! Use /elo para ver os ranks.`;

    if (isUserAdmin) {
        text += `\n\n🔐 *COMANDOS ADMIN*\n` +
            `*/audit* — Últimas 15 contagens\n` +
            `*/setcount <N>* — Define contagem inicial\n` +
            `*/fix <N>* — Força um número\n` +
            `*/del <N>* — Deleta uma cerveja\n` +
            `*/setuser <nome> <N>* — Define total de usuário\n` +
            `*/recalc* — Recalcula estatísticas\n` +
            `*/recap* — Envia recap do dia`;
    }

    // Adiciona hint de doação no final do help
    text += maybeGetDonateHint();

    await sendMessage(jid, text);
}

async function handleDonate(jid: string): Promise<void> {
    const message = getDonateMessage();
    await sendMessage(jid, message);
}

async function handleSetCount(
    jid: string,
    args: string[],
    senderId: string,
    senderName: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    if (!isAdmin(senderId)) {
        logger.warn({ event: 'admin_command_denied', command: 'setcount', senderId });
        await replyToMessage(jid, '❌ Apenas admins podem usar este comando.', message);
        return;
    }

    const number = parseInt(args[0], 10);
    if (isNaN(number) || number < MIN_COUNT_VALUE || number > MAX_COUNT_VALUE) {
        await replyToMessage(jid, `❌ Uso: /setcount <número>\nO número deve estar entre ${MIN_COUNT_VALUE} e ${formatNumber(MAX_COUNT_VALUE)}.\nEx: /setcount 3872`, message);
        return;
    }

    const current = await counterService.getCurrentCount();
    if (current > 0) {
        await replyToMessage(
            jid,
            `❌ Já existe uma contagem em andamento (${current}). Use /fix para corrigir.`,
            message
        );
        return;
    }

    logger.info({ event: 'admin_command_executed', command: 'setcount', number, senderId });
    const success = await counterService.setInitialCount(number, senderId, senderName);
    if (success) {
        await sendMessage(jid, `✅ Contagem iniciada em *${number}*! O próximo é *${number + 1}*. 🍺`);
    } else {
        await replyToMessage(jid, '❌ Erro ao definir contagem inicial.', message);
    }
}

async function handleForceCount(
    jid: string,
    args: string[],
    senderId: string,
    senderName: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    if (!isAdmin(senderId)) {
        logger.warn({ event: 'admin_command_denied', command: 'fix', senderId });
        await replyToMessage(jid, '❌ Apenas admins podem usar este comando.', message);
        return;
    }

    const number = parseInt(args[0], 10);
    if (isNaN(number) || number < 1 || number > MAX_COUNT_VALUE) {
        await replyToMessage(jid, `❌ Uso: /fix <número>\nO número deve estar entre 1 e ${formatNumber(MAX_COUNT_VALUE)}.\nEx: /fix 3875`, message);
        return;
    }

    logger.info({ event: 'admin_command_executed', command: 'fix', number, senderId });
    const success = await counterService.forceCount(number, senderId, senderName);
    if (success) {
        await sendMessage(jid, `✅ Contagem forçada para *${number}*! O próximo é *${number + 1}*. 🍺`);
    } else {
        await replyToMessage(jid, '❌ Erro ao forçar contagem.', message);
    }
}

/**
 * Deleta uma cerveja específica por número
 */
async function handleDeleteCount(
    jid: string,
    args: string[],
    senderId: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    if (!isAdmin(senderId)) {
        logger.warn({ event: 'admin_command_denied', command: 'del', senderId });
        await replyToMessage(jid, '❌ Apenas admins podem usar este comando.', message);
        return;
    }

    const number = parseInt(args[0], 10);
    if (isNaN(number) || number < 1) {
        await replyToMessage(jid, '❌ Uso: /del <número>\nEx: /del 3950', message);
        return;
    }

    logger.info({ event: 'admin_command_executed', command: 'del', number, senderId });
    const deleted = await countRepository.deleteByNumber(number);
    if (deleted) {
        await sendMessage(
            jid,
            `✅ Cerveja *#${number}* deletada!\n` +
            `👤 Era de: ${deleted.userName || 'Anônimo'}\n` +
            `📊 Ranking atualizado automaticamente.`
        );
    } else {
        await replyToMessage(jid, `❌ Cerveja #${number} não encontrada.`, message);
    }
}

/**
 * Força o total de cervejas de um usuário
 * Uso: /setuser <ID ou Nome> <total>
 */
async function handleSetUser(
    jid: string,
    args: string[],
    senderId: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    if (!isAdmin(senderId)) {
        logger.warn({ event: 'admin_command_denied', command: 'setuser', senderId });
        await replyToMessage(jid, '❌ Apenas admins podem usar este comando.', message);
        return;
    }

    if (args.length < 2) {
        await replyToMessage(jid, '❌ Uso: /setuser <ID ou Nome> <total>\nEx: /setuser Felpess 100', message);
        return;
    }

    const total = parseInt(args[args.length - 1], 10);
    if (isNaN(total) || total < 0 || total > MAX_COUNT_VALUE) {
        await replyToMessage(jid, `❌ O total deve ser um número válido entre 0 e ${formatNumber(MAX_COUNT_VALUE)}`, message);
        return;
    }

    const identifier = args.slice(0, -1).join(' ');

    // Tenta encontrar por ID primeiro
    let user = await userRepository.getStats(identifier);

    // Se não encontrou, tenta por nome
    if (!user) {
        user = await userRepository.findByName(identifier);
    }

    if (!user) {
        await replyToMessage(jid, `❌ Usuário "${identifier}" não encontrado.`, message);
        return;
    }

    logger.info({ event: 'admin_command_executed', command: 'setuser', userId: user.id, oldTotal: user.totalCount, newTotal: total, senderId });
    const success = await userRepository.setUserTotal(user.id, total);
    if (success) {
        await sendMessage(
            jid,
            `✅ Total atualizado!\n` +
            `👤 Usuário: *${user.name || user.id}*\n` +
            `🍺 Novo total: *${total}* cervejas`
        );
    } else {
        await replyToMessage(jid, '❌ Erro ao atualizar total do usuário.', message);
    }
}

// Helpers

function formatNumber(n: number): string {
    return n.toLocaleString('pt-BR');
}

function getDaysRemaining(): number {
    const now = new Date();
    const endOfYear = new Date(now.getFullYear(), 11, 31);
    const diff = endOfYear.getTime() - now.getTime();
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

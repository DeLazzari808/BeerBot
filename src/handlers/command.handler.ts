import { proto } from '@whiskeysockets/baileys';
import { config } from '../config/env.js';
import { counterService } from '../core/counter.js';
import { getElo, getNextElo, beersToNextElo, ELOS } from '../core/elo.js';
import { countRepository } from '../database/repositories/count.repo.js';
import { userRepository } from '../database/repositories/user.repo.js';
import { sendMessage, replyToMessage } from '../services/whatsapp.js';
import { logger } from '../utils/logger.js';

/**
 * Verifica se está no horário liberado para comandos de estatísticas
 * Antes das 18h, os comandos de ranking/elo/meu ficam bloqueados
 */
function isStatsTimeAllowed(): boolean {
    const now = new Date();
    const hour = now.getHours();
    return hour >= 18; // Libera a partir das 18:00
}

/**
 * Mensagem amigável para quando os comandos estão bloqueados
 */
const STATS_BLOCKED_MESSAGE =
    `🍺 *Calma, cervejeiro!* 🍺\n\n` +
    `Vai bebendo que depois das *18h* eu te conto como a gente tá! 📊\n\n` +
    `_Bot ainda em desenvolvimento_ 🛠️`;

/**
 * Verifica se o usuário é admin
 * Aceita formato antigo (número) ou novo (ID completo)
 */
function isAdmin(userId: string): boolean {
    // Remove sufixos para comparação
    const cleanId = userId.replace('@s.whatsapp.net', '').replace('@lid', '');

    // Verifica se bate com algum admin (número ou ID completo)
    const isAdm = config.adminNumbers.some(admin => {
        const cleanAdmin = admin.replace('@s.whatsapp.net', '').replace('@lid', '');
        return cleanId === cleanAdmin || userId === admin;
    });

    // Log para debug (temporário)
    if (!isAdm) {
        console.log(`[ADMIN CHECK] User ${userId} não é admin. Admins: ${config.adminNumbers.join(', ')}`);
    }

    return isAdm;
}

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

    logger.debug({ event: 'command', command, args, sender: senderName });

    switch (command) {
        case 'status':
        case 's':
            await handleStatus(jid);
            break;

        case 'rank':
        case 'ranking':
        case 'top':
            if (!isStatsTimeAllowed()) {
                await replyToMessage(jid, STATS_BLOCKED_MESSAGE, message);
                break;
            }
            await handleRanking(jid);
            break;

        case 'meu':
        case 'me':
        case 'stats':
            if (!isStatsTimeAllowed()) {
                await replyToMessage(jid, STATS_BLOCKED_MESSAGE, message);
                break;
            }
            await handleMyStats(jid, senderId, senderName, message);
            break;

        case 'elo':
        case 'elos':
            if (!isStatsTimeAllowed()) {
                await replyToMessage(jid, STATS_BLOCKED_MESSAGE, message);
                break;
            }
            await handleElos(jid);
            break;

        case 'audit':
        case 'auditoria':
            if (!isAdmin(senderId)) {
                await replyToMessage(jid, '❌ Apenas admins podem usar este comando.', message);
                break;
            }
            await handleAudit(jid);
            break;

        case 'help':
        case 'ajuda':
        case 'comandos':
            await handleHelp(jid);
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
                await replyToMessage(jid, '❌ Apenas admins podem usar este comando.', message);
                break;
            }
            // Importa e executa o recap dinamicamente
            const { sendDailyRecap } = await import('../services/scheduler.js');
            await sendDailyRecap();
            break;

        default:
            // Comando desconhecido, ignora
            break;
    }
}

async function handleStatus(jid: string): Promise<void> {
    const progress = counterService.getProgress();
    const participants = userRepository.getTotalParticipants();

    const remaining = progress.goal - progress.current;
    const beersPerDay = Math.ceil(remaining / getDaysRemaining());

    const text =
        `🍺 *STATUS DA CONTAGEM* 🍺\n\n` +
        `📊 Atual: *${formatNumber(progress.current)}* cervejas\n` +
        `🎯 Meta: *${formatNumber(progress.goal)}* cervejas\n` +
        `📈 Progresso: *${progress.percentage}%*\n` +
        `⏳ Faltam: *${formatNumber(remaining)}* cervejas\n` +
        `👥 Participantes: *${participants}*\n\n` +
        `📅 Média necessária: *${formatNumber(beersPerDay)}/dia*`;

    await sendMessage(jid, text);
}

async function handleRanking(jid: string): Promise<void> {
    const top = userRepository.getTopN(10);

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
        `\n\n_Use /elo para ver todos os ranks_`;

    await sendMessage(jid, text);
}

async function handleMyStats(
    jid: string,
    senderId: string,
    senderName: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    const stats = userRepository.getStats(senderId);

    if (!stats) {
        await replyToMessage(jid, '📊 Você ainda não contabilizou cervejas desde o início do bot (12/01/2026). Mande sua próxima gelada! 🍺', message);
        return;
    }

    const rank = userRepository.getRank(senderId);
    const progress = counterService.getProgress();
    const contribution = ((stats.totalCount / progress.current) * 100).toFixed(2);

    const elo = getElo(stats.totalCount);
    const nextElo = getNextElo(stats.totalCount);
    const toNextElo = beersToNextElo(stats.totalCount);

    let eloText = `${elo.emoji} *${elo.name}*`;
    if (nextElo && toNextElo > 0) {
        eloText += `\n📈 Próximo: ${nextElo.emoji} ${nextElo.name} (faltam ${toNextElo})`;
    }

    const text =
        `📊 *SUAS ESTATÍSTICAS* 📊\n\n` +
        `🍺 Total: *${stats.totalCount}* cervejas\n` +
        `🏆 Ranking: *#${rank}*\n` +
        `📈 Contribuição: *${contribution}%*\n\n` +
        `🎖️ Elo: ${eloText}`;

    await replyToMessage(jid, text, message);
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

async function handleAudit(jid: string): Promise<void> {
    const last = countRepository.getLastN(15);

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

async function handleHelp(jid: string): Promise<void> {
    const text =
        `🍺 *COMANDOS DO BOT* 🍺\n\n` +
        `*/status* — Ver contagem atual\n` +
        `*/rank* — Top 10 bebedores\n` +
        `*/meu* — Suas estatísticas\n` +
        `*/audit* — Últimas contagens\n` +
        `*/help* — Esta mensagem\n\n` +
        `📝 *COMO CONTAR*\n` +
        `Envie uma foto + o número da vez.\n` +
        `Ex: foto + "3873"`;

    await sendMessage(jid, text);
}

async function handleSetCount(
    jid: string,
    args: string[],
    senderId: string,
    senderName: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    if (!isAdmin(senderId)) {
        await replyToMessage(jid, '❌ Apenas admins podem usar este comando.', message);
        return;
    }

    const number = parseInt(args[0], 10);
    if (isNaN(number) || number < 0) {
        await replyToMessage(jid, '❌ Uso: /setcount <número>\nEx: /setcount 3872', message);
        return;
    }

    const current = counterService.getCurrentCount();
    if (current > 0) {
        await replyToMessage(
            jid,
            `❌ Já existe uma contagem em andamento (${current}). Use /fix para corrigir.`,
            message
        );
        return;
    }

    const success = counterService.setInitialCount(number, senderId, senderName);
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
        await replyToMessage(jid, '❌ Apenas admins podem usar este comando.', message);
        return;
    }

    const number = parseInt(args[0], 10);
    if (isNaN(number) || number < 1) {
        await replyToMessage(jid, '❌ Uso: /fix <número>\nEx: /fix 3875', message);
        return;
    }

    const success = counterService.forceCount(number, senderId, senderName);
    if (success) {
        await sendMessage(jid, `✅ Contagem forçada para *${number}*! O próximo é *${number + 1}*. 🍺`);
    } else {
        await replyToMessage(jid, '❌ Erro ao forçar contagem.', message);
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

/**
 * Comandos públicos - status, rank, meu, elo, hoje, help
 */

import { proto } from '@whiskeysockets/baileys';
import { counterService } from '../../core/counter.js';
import { getElo, getNextElo, beersToNextElo, ELOS } from '../../core/elo.js';
import { countRepository } from '../../database/repositories/count.repo.js';
import { userRepository } from '../../database/repositories/user.repo.js';
import { sendMessage, replyToMessage } from '../../services/whatsapp.js';
import { formatNumber, getDaysRemaining, isAdmin } from './utils.js';

export async function handleStatus(jid: string): Promise<void> {
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
        `📅 Média necessária: *${formatNumber(beersPerDay)}/dia*`;

    await sendMessage(jid, text);
}

export async function handleRanking(jid: string): Promise<void> {
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
        `\n\n_Use /elo para ver todos os ranks_`;

    await sendMessage(jid, text);
}

export async function handleMyStats(
    jid: string,
    senderId: string,
    senderName: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    const stats = await userRepository.getStats(senderId);

    if (!stats) {
        await replyToMessage(jid, '📊 Você ainda não contabilizou cervejas. Mande sua próxima gelada! 🍺', message);
        return;
    }

    // Paraleliza queries independentes
    const [rank, progress] = await Promise.all([
        userRepository.getRank(senderId),
        counterService.getProgress(),
    ]);

    const contribution = progress.current > 0
        ? ((stats.totalCount / progress.current) * 100).toFixed(2)
        : '0.00';

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

export async function handleElos(jid: string): Promise<void> {
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

export async function handleToday(jid: string): Promise<void> {
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

export async function handleWeek(jid: string): Promise<void> {
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

    const dayEmojis: { [key: string]: string } = {
        '0': '🌙', '1': '📅', '2': '📅', '3': '📅',
        '4': '📅', '5': '🎉', '6': '🍻',
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

export async function handleHelp(jid: string, isUserAdmin: boolean): Promise<void> {
    let text =
        `🍺 *COMANDOS DO BOT* 🍺\n\n` +
        `*/status* (ou */s*) — Ver contagem atual\n` +
        `*/rank* — Top 10 bebedores\n` +
        `*/meu* — Suas estatísticas\n` +
        `*/elo* — Ver sistema de elos\n` +
        `*/hoje* — Estatísticas de hoje\n` +
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

    await sendMessage(jid, text);
}

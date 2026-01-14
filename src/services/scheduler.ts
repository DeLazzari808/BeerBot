import { config } from '../config/env.js';
import { countRepository } from '../database/repositories/count.repo.js';
import { userRepository } from '../database/repositories/user.repo.js';
import { counterService } from '../core/counter.js';
import { getElo } from '../core/elo.js';
import { sendMessage } from '../services/whatsapp.js';
import { logger } from '../utils/logger.js';
import { getDatabase } from '../database/sqlite.js';

let recapInterval: NodeJS.Timeout | null = null;

/**
 * Inicia o scheduler do recap diário
 */
export function startDailyRecapScheduler(): void {
    // Verifica a cada minuto
    recapInterval = setInterval(() => {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        // 23:45
        if (hours === 23 && minutes === 45) {
            sendDailyRecap();
        }
    }, 60 * 1000); // Checa a cada minuto

    logger.info('📅 Scheduler de recap diário iniciado (23:45)');
}

/**
 * Para o scheduler
 */
export function stopDailyRecapScheduler(): void {
    if (recapInterval) {
        clearInterval(recapInterval);
        recapInterval = null;
    }
}

/**
 * Frases aleatórias divertidas
 */
const funFacts = [
    '🧠 Curiosidade: Se empilhássemos todas as latas, teríamos uma torre de {height}m!',
    '🌍 Isso equivale a {liters} litros de cerveja consumidos!',
    '⏱️ Média de {perHour} cervejas por hora hoje!',
    '🚀 A esse ritmo, chegamos no milhão em {daysToGoal} dias!',
    '💪 O grupo está {percent}% mais alcoólatra que ontem!',
    '🍺 Hoje bebemos o equivalente a {cases} caixas de cerveja!',
    '🌙 Horário de pico: entre as {peakHour}h foi quando mais beberam!',
    '📱 {uniqueUsers} pessoas diferentes beberam hoje!',
];

const closingPhrases = [
    'Boa noite e não esqueçam de hidratar! 💧🍺',
    'Amanhã tem mais! 🌅🍺',
    'Sonhem com cervejas geladas! 🛏️🍺',
    'O fígado agradece a pausa noturna! 😴🍺',
    'Descansem os copos, guerreiros! ⚔️🍺',
    'Até amanhã, cervejeiros! 🌙🍺',
    'Bons sonhos etílicos! 💤🍺',
];

/**
 * Envia o recap diário melhorado
 */
export async function sendDailyRecap(): Promise<void> {
    if (!config.groupId) {
        logger.warn('GROUP_ID não configurado, pulando recap');
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    const stats = countRepository.getDailyStats(today);

    if (stats.total === 0) {
        const sadPhrases = [
            '😴 Dia de ressaca? Nenhuma cerveja contada!',
            '🏜️ Deserto alcoólico hoje... Zero cervejas!',
            '📉 Dia mais seco que o Saara!',
            '😱 Inacreditável! Ninguém bebeu hoje?!',
        ];
        const phrase = sadPhrases[Math.floor(Math.random() * sadPhrases.length)];

        await sendMessage(
            config.groupId,
            `📊 *RECAP DO DIA* 📊\n\n${phrase}\n\nAmanhã a gente recupera! 🍺`
        );
        return;
    }

    const progress = counterService.getProgress();
    const topContributors = stats.topContributors.slice(0, 5);
    const db = getDatabase();

    // Dados extras curiosos
    const uniqueUsers = stats.topContributors.length;
    const avgPerUser = (stats.total / uniqueUsers).toFixed(1);
    const beersRange = stats.endNumber - stats.startNumber + 1;

    // Calcular litros (assumindo 350ml por cerveja)
    const liters = ((stats.total * 350) / 1000).toFixed(1);

    // Caixas de 12
    const cases = Math.floor(stats.total / 12);

    // Altura da torre de latas (12cm cada)
    const height = ((stats.total * 12) / 100).toFixed(1);

    // Dias até a meta
    const remaining = progress.goal - progress.current;
    const daysToGoal = stats.total > 0 ? Math.ceil(remaining / stats.total) : 999999;

    // Quem mais bebeu hoje (MVP do dia)
    const mvp = topContributors[0];
    const mvpElo = mvp ? getElo(userRepository.getStats(mvp.userId)?.totalCount || mvp.count) : null;

    // Formata top contributors com elo
    const topLines = topContributors.map((c, i) => {
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        const userStats = userRepository.getStats(c.userId);
        const eloInfo = userStats ? getElo(userStats.totalCount) : getElo(c.count);
        const percentage = ((c.count / stats.total) * 100).toFixed(0);
        return `${medals[i]} *${c.userName}* — ${c.count} (${percentage}%) ${eloInfo.emoji}`;
    });

    // Líder geral do ranking
    const overallLeader = userRepository.getTopN(1)[0];
    const leaderElo = overallLeader ? getElo(overallLeader.totalCount) : null;

    // Frase de fechamento aleatória
    const closing = closingPhrases[Math.floor(Math.random() * closingPhrases.length)];

    // Fun fact aleatório
    const randomFact = funFacts[Math.floor(Math.random() * funFacts.length)]
        .replace('{height}', height)
        .replace('{liters}', liters)
        .replace('{perHour}', (stats.total / 24).toFixed(1))
        .replace('{daysToGoal}', daysToGoal.toLocaleString('pt-BR'))
        .replace('{percent}', (Math.floor(Math.random() * 30) + 10).toString())
        .replace('{cases}', cases.toString())
        .replace('{peakHour}', (18 + Math.floor(Math.random() * 4)).toString())
        .replace('{uniqueUsers}', uniqueUsers.toString());

    const message =
        `📊 *RECAP DO DIA* 📊\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🍺 Cervejas hoje: *${stats.total}*\n` +
        `📈 Range: #${stats.startNumber} → #${stats.endNumber}\n` +
        `👥 Bebedores únicos: *${uniqueUsers}*\n` +
        `📊 Média por pessoa: *${avgPerUser}* cervejas\n\n` +
        `🏆 *MVP DO DIA:*\n` +
        `${mvp ? `🌟 *${mvp.userName}* com ${mvp.count} cervejas! ${mvpElo?.emoji || ''}` : 'Ninguém ainda!'}\n\n` +
        `🎖️ *TOP 5 DO DIA:*\n${topLines.join('\n')}\n\n` +
        `👑 *LÍDER GERAL:*\n` +
        `${overallLeader ? `${leaderElo?.emoji || ''} *${overallLeader.name}* com ${overallLeader.totalCount} cervejas!` : ''}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🎯 *PROGRESSO PRO MILHÃO:*\n` +
        `📍 Atual: *${progress.current.toLocaleString('pt-BR')}* (${progress.percentage}%)\n` +
        `⏳ Faltam: *${remaining.toLocaleString('pt-BR')}*\n\n` +
        `${randomFact}\n\n` +
        `${closing}`;

    await sendMessage(config.groupId, message);
    logger.info({ event: 'daily_recap_sent', total: stats.total });
}

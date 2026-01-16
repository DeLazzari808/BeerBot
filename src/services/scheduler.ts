import { config } from '../config/env.js';
import { countRepository } from '../database/repositories/count.repo.js';
import { userRepository } from '../database/repositories/user.repo.js';
import { counterService } from '../core/counter.js';
import { getElo } from '../core/elo.js';
import { sendMessage } from '../services/whatsapp.js';
import { logger } from '../utils/logger.js';
import { DAILY_RECAP_HOUR, DAILY_RECAP_MINUTE } from '../config/constants.js';
import { maybeGetDonateHint } from '../config/donate.js';

let recapInterval: NodeJS.Timeout | null = null;
let lastRecapDate: string | null = null; // Evita recaps duplicados

/**
 * Inicia o scheduler do recap diário
 */
export function startDailyRecapScheduler(): void {
    // Verifica a cada minuto
    recapInterval = setInterval(() => {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const today = now.toISOString().split('T')[0];

        // Evita executar múltiplas vezes no mesmo dia
        if (hours === DAILY_RECAP_HOUR && minutes === DAILY_RECAP_MINUTE && lastRecapDate !== today) {
            lastRecapDate = today;
            sendDailyRecap();
        }
    }, 60 * 1000); // Checa a cada minuto

    logger.info({ event: 'scheduler_started', hour: DAILY_RECAP_HOUR, minute: DAILY_RECAP_MINUTE });
}

/**
 * Para o scheduler
 */
export function stopDailyRecapScheduler(): void {
    if (recapInterval) {
        clearInterval(recapInterval);
        recapInterval = null;
        logger.info({ event: 'scheduler_stopped' });
    }
}

/**
 * Fatos engraçados baseados em dados reais
 */
const funFactsTemplates = [
    // Baseados em altura/volume
    '🗼 Torre de latas: {height}m! Quase {buildings}!',
    '🌊 {liters} litros consumidos! Dá pra encher {pools}!',
    '🚛 {cases} engradados! Um caminhão de cerveja fica com inveja!',

    // Baseados em tempo/ritmo
    '⚡ Média de {perHour} por hora! Os barmen estão suando!',
    '🏃 1 cerveja a cada {minutesPerBeer} minutos! Esses caras não param!',
    '🚀 Nesse ritmo, 1 MILHÃO em {daysToGoal} dias!',

    // Comparações absurdas
    '🐘 Em peso, bebemos o equivalente a {weight}kg de cerveja!',
    '💰 Gastamos aproximadamente R${spent} em cervejas hoje!',
    '🍕 Calorias: {calories}kcal! Equivale a {pizzas} pizzas!',

    // Piadas internas
    '🧠 Se cada cerveja mata 1000 neurônios, perdemos {neurons} milhões hoje!',
    '🚽 Estimativa de idas ao banheiro: {bathroom} vezes!',
    '📱 {uniqueUsers} pessoas provaram que o celular funciona bêbado!',
    '🌙 Horário de pico: {peakHour}h! O happy hour não tem fim!',

    // Motivacionais irônicos
    '💪 {percent}% mais alcoólatras que ontem! Evoluindo!',
    '🏆 Cada cerveja nos aproxima do milhão. Vocês são heróis!',
    '🍺 Cerveja é 95% água. Hoje foi dia de hidratação!',
];

/**
 * Frases quando ninguém bebeu
 */
const sadPhrases = [
    '😴 Dia de ressaca? Zero cervejas registradas!',
    '🏜️ Deserto alcoólico... O Saara teve mais ação!',
    '📉 Gráfico de cervejas: reta flat. Como o ECG do grupo!',
    '😱 ZERO cervejas?! O bot tá funcionando??',
    '🤧 Ficaram todos doentes ou é greve de fígado?',
    '💔 O bot chorou hoje. Não contou nenhuma cerveja.',
    '🧊 Dia mais gelado que cerveja no freezer... sem movimento!',
];

/**
 * Frases de fechamento
 */
const closingPhrases = [
    'Boa noite e lembrem: água entre as cervejas! 💧🍺',
    'Amanhã tem mais! O fígado descansa, a vontade não! 🌅🍺',
    'Sonhem com chopps gelados e contas pagas! 🛏️🍺',
    'O fígado agradece a pausa... até amanhã! 😴🍺',
    'Guardem as energias pros próximos litros! ⚔️🍺',
    'Até amanhã, guerreiros da espuma! 🌙🍺',
    'Bons sonhos etílicos! Amanhã a meta nos espera! 💤🍺',
    'Descansem, mas não esqueçam: faltam muitas pro milhão! 🎯🍺',
];

/**
 * Títulos para dias especiais
 */
function getSpecialTitle(total: number, dayOfWeek: number): string | null {
    if (dayOfWeek === 5) return '🎉 *SEXTA-FEIRA RECAP* 🎉'; // Sexta
    if (dayOfWeek === 6) return '🍻 *SÁBADO RECAP* 🍻'; // Sábado
    if (dayOfWeek === 0) return '😴 *DOMINGO RECAP* 😴'; // Domingo
    if (total >= 200) return '🔥 *DIA LENDÁRIO* 🔥';
    if (total >= 100) return '🚀 *DIA ÉPICO* 🚀';
    if (total >= 50) return '💪 *DIA PRODUTIVO* 💪';
    if (total < 10) return '😢 *DIA FRACO* 😢';
    return null;
}

/**
 * Gera um fun fact baseado nos dados reais
 */
function generateFunFact(stats: { total: number }, progress: { goal: number; current: number }, uniqueUsers: number): string {
    const total = stats.total;
    const remaining = progress.goal - progress.current;

    // Cálculos reais
    const liters = ((total * 350) / 1000).toFixed(1);
    const cases = Math.floor(total / 12);
    const height = ((total * 12) / 100).toFixed(1);
    const weight = ((total * 350) / 1000).toFixed(1); // kg de líquido
    const spent = (total * 8).toFixed(0); // R$8 média por cerveja
    const calories = total * 150; // ~150kcal por cerveja
    const pizzas = Math.floor(calories / 1200); // ~1200kcal por pizza
    const neurons = (total * 1000 / 1000000).toFixed(1); // milhões de neurônios
    const bathroom = Math.floor(total * 1.5); // estimativa de idas ao banheiro
    const perHour = (total / 24).toFixed(1);
    const minutesPerBeer = total > 0 ? Math.floor(1440 / total) : 999;
    const daysToGoal = total > 0 ? Math.ceil(remaining / total) : 999999;
    const percent = Math.floor(Math.random() * 30) + 10;
    const peakHour = 18 + Math.floor(Math.random() * 5);

    // Comparações engraçadas para altura
    const heightNum = parseFloat(height);
    const buildingComparisons = [
        heightNum > 10 ? 'um prédio de 3 andares' : 'uma girafa',
        heightNum > 20 ? 'metade do Cristo Redentor' : 'um poste de luz',
        heightNum > 5 ? 'um jogador de basquete' : 'um Oompa Loompa',
    ];
    const buildings = buildingComparisons[Math.floor(Math.random() * buildingComparisons.length)];

    // Comparações para litros
    const litersNum = parseFloat(liters);
    const poolComparisons = [
        litersNum > 50 ? 'uma banheira' : 'um balde grande',
        parseFloat(liters) > 100 ? 'jacuzzi' : 'um aquário',
    ];
    const pools = poolComparisons[Math.floor(Math.random() * poolComparisons.length)];

    // Seleciona template aleatório e substitui
    const template = funFactsTemplates[Math.floor(Math.random() * funFactsTemplates.length)];

    return template
        .replace('{height}', height)
        .replace('{buildings}', buildings)
        .replace('{liters}', liters)
        .replace('{pools}', pools)
        .replace('{cases}', cases.toString())
        .replace('{perHour}', perHour)
        .replace('{minutesPerBeer}', minutesPerBeer.toString())
        .replace('{daysToGoal}', daysToGoal.toLocaleString('pt-BR'))
        .replace('{weight}', weight)
        .replace('{spent}', spent)
        .replace('{calories}', calories.toLocaleString('pt-BR'))
        .replace('{pizzas}', pizzas.toString())
        .replace('{neurons}', neurons)
        .replace('{bathroom}', bathroom.toString())
        .replace('{uniqueUsers}', uniqueUsers.toString())
        .replace('{peakHour}', peakHour.toString())
        .replace('{percent}', percent.toString());
}

/**
 * Envia o recap diário melhorado
 */
export async function sendDailyRecap(): Promise<void> {
    if (!config.groupId) {
        logger.warn({ event: 'recap_skipped', reason: 'no_group_id' });
        return;
    }

    logger.info({ event: 'recap_start' });

    const today = new Date().toISOString().split('T')[0];
    const dayOfWeek = new Date().getDay();
    const stats = await countRepository.getDailyStats(today);

    if (stats.total === 0) {
        const phrase = sadPhrases[Math.floor(Math.random() * sadPhrases.length)];
        await sendMessage(
            config.groupId,
            `📊 *RECAP DO DIA* 📊\n\n${phrase}\n\nAmanhã a gente recupera! 🍺`
        );
        logger.info({ event: 'recap_sent', total: 0 });
        return;
    }

    const progress = await counterService.getProgress();
    const topContributors = stats.topContributors.slice(0, 5);

    // Dados
    const uniqueUsers = stats.topContributors.length;
    const avgPerUser = (stats.total / uniqueUsers).toFixed(1);

    // MVP
    const mvp = topContributors[0];

    // Busca stats de todos os contributors em batch
    const contributorIds = topContributors.map(c => c.userId);
    const contributorStats = await userRepository.getStatsBatch(contributorIds);

    const mvpStats = mvp ? contributorStats.get(mvp.userId) : null;
    const mvpElo = mvpStats ? getElo(mvpStats.totalCount) : (mvp ? getElo(mvp.count) : null);

    // Top 5 formatado (usando batch stats)
    const topLines: string[] = [];
    for (let i = 0; i < topContributors.length; i++) {
        const c = topContributors[i];
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        const userStats = contributorStats.get(c.userId);
        const eloInfo = userStats ? getElo(userStats.totalCount) : getElo(c.count);
        const percentage = ((c.count / stats.total) * 100).toFixed(0);
        topLines.push(`${medals[i]} *${c.userName}* — ${c.count} (${percentage}%) ${eloInfo.emoji}`);
    }

    // Líder geral
    const overallLeaders = await userRepository.getTopN(1);
    const overallLeader = overallLeaders[0];
    const leaderElo = overallLeader ? getElo(overallLeader.totalCount) : null;

    // Título especial
    const specialTitle = getSpecialTitle(stats.total, dayOfWeek);
    const title = specialTitle || '📊 *RECAP DO DIA* 📊';

    // Fun facts (2 aleatórios)
    const funFact1 = generateFunFact(stats, progress, uniqueUsers);
    const funFact2 = generateFunFact(stats, progress, uniqueUsers);

    // Frase de fechamento
    const closing = closingPhrases[Math.floor(Math.random() * closingPhrases.length)];

    const remaining = progress.goal - progress.current;

    const message =
        `${title}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🍺 Cervejas hoje: *${stats.total}*\n` +
        `📈 Range: #${stats.startNumber} → #${stats.endNumber}\n` +
        `👥 Bebedores: *${uniqueUsers}* | Média: *${avgPerUser}*/pessoa\n\n` +
        `🏆 *MVP DO DIA:*\n` +
        `${mvp ? `🌟 *${mvp.userName}* com ${mvp.count} cervejas! ${mvpElo?.emoji || ''}` : 'Ninguém ainda!'}\n\n` +
        `🎖️ *TOP 5:*\n${topLines.join('\n')}\n\n` +
        `👑 *LÍDER GERAL:*\n` +
        `${overallLeader ? `${leaderElo?.emoji || ''} *${overallLeader.name}* — ${overallLeader.totalCount} 🍺` : ''}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🎯 *RUMO AO MILHÃO:*\n` +
        `📍 *${progress.current.toLocaleString('pt-BR')}* / 1.000.000 (${progress.percentage}%)\n` +
        `⏳ Faltam: *${remaining.toLocaleString('pt-BR')}*\n\n` +
        `💡 ${funFact1}\n` +
        `💡 ${funFact2}\n\n` +
        `${closing}` +
        maybeGetDonateHint();

    await sendMessage(config.groupId, message);
    logger.info({ event: 'recap_sent', total: stats.total, contributors: uniqueUsers });
}

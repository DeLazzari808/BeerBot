/**
 * Sistema de Elos baseado na quantidade de cervejas contadas
 */

export interface Elo {
    name: string;
    emoji: string;
    minCount: number;
    maxCount: number;
}

export const ELOS: Elo[] = [
    { name: 'Água com Gás', emoji: '💧', minCount: 0, maxCount: 9 },
    { name: 'Iniciante', emoji: '🍺', minCount: 10, maxCount: 29 },
    { name: 'Casual', emoji: '🍻', minCount: 30, maxCount: 59 },
    { name: 'Frequentador', emoji: '🥃', minCount: 60, maxCount: 99 },
    { name: 'Veterano', emoji: '🏅', minCount: 100, maxCount: 199 },
    { name: 'Lendário', emoji: '🏆', minCount: 200, maxCount: 349 },
    { name: 'Mestre Cervejeiro', emoji: '👑', minCount: 350, maxCount: 499 },
    { name: 'Imortal', emoji: '⚡', minCount: 500, maxCount: 749 },
    { name: 'Divino', emoji: '🔱', minCount: 750, maxCount: 999 },
    { name: 'O Lendário', emoji: '🌟', minCount: 1000, maxCount: Infinity },
];

/**
 * Retorna o elo baseado na quantidade de cervejas
 */
export function getElo(count: number): Elo {
    for (const elo of ELOS) {
        if (count >= elo.minCount && count <= elo.maxCount) {
            return elo;
        }
    }
    return ELOS[0];
}

/**
 * Retorna o próximo elo
 */
export function getNextElo(count: number): Elo | null {
    const currentElo = getElo(count);
    const currentIndex = ELOS.indexOf(currentElo);

    if (currentIndex < ELOS.length - 1) {
        return ELOS[currentIndex + 1];
    }
    return null;
}

/**
 * Calcula cervejas restantes para o próximo elo
 */
export function beersToNextElo(count: number): number {
    const nextElo = getNextElo(count);
    if (!nextElo) return 0;
    return nextElo.minCount - count;
}

/**
 * Formata o elo para exibição
 */
export function formatElo(count: number): string {
    const elo = getElo(count);
    return `${elo.emoji} ${elo.name}`;
}

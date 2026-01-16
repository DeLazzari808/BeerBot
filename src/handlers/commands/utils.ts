/**
 * Utilitários compartilhados para comandos
 */

import { proto } from '@whiskeysockets/baileys';
import { config } from '../../config/env.js';
import { replyToMessage } from '../../services/whatsapp.js';
import { logger } from '../../utils/logger.js';
import { COOLDOWN_MS, MAX_COUNT_VALUE, STATS_UNLOCK_HOUR } from '../../config/constants.js';

// Rate limiting - Map compartilhado
const userCommandCooldowns = new Map<string, number>();

/**
 * Verifica se o usuário é admin
 * Aceita formato antigo (número) ou novo (ID completo)
 */
export function isAdmin(userId: string): boolean {
    const cleanId = userId.replace('@s.whatsapp.net', '').replace('@lid', '');
    return config.adminNumbers.some(admin => {
        const cleanAdmin = admin.replace('@s.whatsapp.net', '').replace('@lid', '');
        return cleanId === cleanAdmin || userId === admin;
    });
}

/**
 * Verifica se o usuário está em cooldown
 */
export function checkRateLimit(userId: string): { allowed: boolean; waitTime?: number } {
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

/**
 * Verifica se está no horário liberado para comandos de estatísticas
 */
export function isStatsTimeAllowed(): boolean {
    const now = new Date();
    return now.getHours() >= STATS_UNLOCK_HOUR;
}

/**
 * Mensagem amigável para quando os comandos estão bloqueados
 */
export const STATS_BLOCKED_MESSAGE =
    `🍺 *Calma, cervejeiro!* 🍺\n\n` +
    `Vai bebendo que depois das *${STATS_UNLOCK_HOUR}h* eu te conto como a gente tá! 📊\n\n` +
    `_Bot ainda em desenvolvimento_ 🛠️`;

/**
 * Middleware para verificar se é admin e responder se não for
 */
export async function requireAdmin(
    jid: string,
    senderId: string,
    message: proto.IWebMessageInfo,
    commandName: string
): Promise<boolean> {
    if (!isAdmin(senderId)) {
        logger.warn({ event: 'admin_command_denied', command: commandName, senderId });
        await replyToMessage(jid, '❌ Apenas admins podem usar este comando.', message);
        return false;
    }
    logger.info({ event: 'admin_command_executed', command: commandName, senderId });
    return true;
}

/**
 * Valida número para comandos admin
 */
export function validateCountNumber(
    value: string,
    min: number = 1,
    max: number = MAX_COUNT_VALUE
): { valid: boolean; number?: number; errorMessage?: string } {
    const number = parseInt(value, 10);

    if (isNaN(number) || number < min || number > max) {
        return {
            valid: false,
            errorMessage: `O número deve estar entre ${min} e ${formatNumber(max)}.`
        };
    }

    return { valid: true, number };
}

/**
 * Formata número com separador de milhar brasileiro
 */
export function formatNumber(n: number): string {
    return n.toLocaleString('pt-BR');
}

/**
 * Calcula dias restantes até o fim do ano
 */
export function getDaysRemaining(): number {
    const now = new Date();
    const endOfYear = new Date(now.getFullYear(), 11, 31);
    const diff = endOfYear.getTime() - now.getTime();
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Limpa cooldowns expirados (chamado periodicamente)
 */
export function cleanupCooldowns(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [userId, timestamp] of userCommandCooldowns.entries()) {
        if (now - timestamp > COOLDOWN_MS) {
            userCommandCooldowns.delete(userId);
            cleaned++;
        }
    }
    return cleaned;
}

// Listas de comandos
export const PUBLIC_COMMANDS = [
    'status', 's', 'rank', 'ranking', 'top', 'meu', 'me', 'stats',
    'elo', 'elos', 'help', 'ajuda', 'comandos', 'hoje'
];

export const ADMIN_COMMANDS = [
    'audit', 'auditoria', 'setcount', 'iniciar', 'fix', 'forcar',
    'recap', 'recalc', 'sync', 'del', 'deletar', 'setuser'
];

export const VALID_COMMANDS = [...PUBLIC_COMMANDS, ...ADMIN_COMMANDS];

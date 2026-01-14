import { proto } from '@whiskeysockets/baileys';
import { config } from '../config/env.js';
import { parseCountFromMessage } from '../core/parser.js';
import { counterService } from '../core/counter.js';
import { userRepository } from '../database/repositories/user.repo.js';
import { reactToMessage, replyToMessage } from '../services/whatsapp.js';
import { logger } from '../utils/logger.js';
import { handleCommand } from './command.handler.js';

/**
 * Extrai o texto da mensagem
 */
function getMessageText(message: proto.IWebMessageInfo): string | null {
    const msg = message.message;
    if (!msg) return null;

    return (
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        null
    );
}

/**
 * Verifica se a mensagem tem imagem
 */
function hasImage(message: proto.IWebMessageInfo): boolean {
    return !!message.message?.imageMessage;
}

/**
 * Extrai o ID do remetente
 */
function getSenderId(message: proto.IWebMessageInfo): string {
    return message.key?.participant || message.key?.remoteJid || '';
}

/**
 * Extrai o nome do remetente
 */
function getSenderName(message: proto.IWebMessageInfo): string {
    return message.pushName || 'Anônimo';
}

/**
 * Handler principal de mensagens
 */
export async function handleMessage(message: proto.IWebMessageInfo): Promise<void> {
    const jid = message.key?.remoteJid;
    if (!jid || !message.key) return;

    // Filtra apenas mensagens do grupo configurado
    if (config.groupId && jid !== config.groupId) {
        return;
    }

    // Se não tiver group ID configurado, aceita qualquer grupo
    const isGroup = jid.endsWith('@g.us');
    if (!isGroup) return;

    const text = getMessageText(message);
    const messageHasImage = hasImage(message);

    // Log útil para descobrir o GROUP_ID
    if (!config.groupId) {
        console.log(`\n📋 Mensagem recebida do grupo: ${jid}`);
        console.log(`   Use este ID no .env: GROUP_ID=${jid}\n`);
    }

    const senderId = getSenderId(message);
    const senderName = getSenderName(message);

    // Verifica se é um comando
    if (text?.startsWith('/')) {
        await handleCommand(message, text, senderId, senderName, jid);
        return;
    }

    // ============================================
    // MODO AUTO-CONTAGEM: Foto sem número ou qualquer erro
    // ============================================

    // Se mandou imagem, processa automaticamente
    if (messageHasImage) {
        const parsed = text ? parseCountFromMessage(text) : { success: false, number: null, raw: '' };
        const currentCount = counterService.getCurrentCount();
        const nextNumber = currentCount + 1;

        // Caso 1: Foto SEM número - auto-conta
        if (!parsed.success || parsed.number === null) {
            const result = counterService.attemptCount({
                number: nextNumber,
                userId: senderId,
                userName: senderName,
                messageId: message.key.id || undefined,
                hasImage: true,
            });

            if (result.success) {
                const userStats = userRepository.getStats(senderId);
                const totalBeers = userStats?.totalCount || 1;
                await replyToMessage(
                    jid,
                    `🍺 *#${nextNumber}* — ${senderName} (${totalBeers}ª)`,
                    message
                );
                await celebrateIfMilestone(jid, nextNumber, senderName, message);
            }
            return;
        }

        // Caso 2: Foto COM número CERTO
        if (parsed.number === nextNumber) {
            const result = counterService.attemptCount({
                number: nextNumber,
                userId: senderId,
                userName: senderName,
                messageId: message.key.id || undefined,
                hasImage: true,
            });

            if (result.success) {
                await reactToMessage(jid, message.key!, '✅');
                await celebrateIfMilestone(jid, nextNumber, senderName, message);
            } else {
                // Alguém foi mais rápido
                const newNext = counterService.getCurrentCount() + 1;
                await autoCount(jid, newNext, senderId, senderName, message);
            }
            return;
        }

        // Caso 3: Foto COM número ERRADO - corrige automaticamente
        const result = counterService.attemptCount({
            number: nextNumber,
            userId: senderId,
            userName: senderName,
            messageId: message.key.id || undefined,
            hasImage: true,
        });

        if (result.success) {
            const userStats = userRepository.getStats(senderId);
            const totalBeers = userStats?.totalCount || 1;
            await replyToMessage(
                jid,
                `⚠️ Ops! Era *#${nextNumber}*, não ${parsed.number}.\n🍺 Corrigido: *#${nextNumber}* — ${senderName} (${totalBeers}ª)`,
                message
            );
            await celebrateIfMilestone(jid, nextNumber, senderName, message);
        }
        return;
    }

    // ============================================
    // MENSAGEM SEM IMAGEM - IGNORA CONTAGEM
    // ============================================
    // Pessoas conversam no grupo, então números sem foto são ignorados
    // Isso evita contar mensagens de conversa como cervejas

    // Não faz nada - só fotos contam!

    logger.debug({
        event: 'text_only_ignored',
        text: text?.substring(0, 50),
        sender: senderName,
    });
}

/**
 * Auto-conta e responde
 */
async function autoCount(
    jid: string,
    number: number,
    senderId: string,
    senderName: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    const result = counterService.attemptCount({
        number,
        userId: senderId,
        userName: senderName,
        messageId: message.key?.id || undefined,
        hasImage: true,
    });

    if (result.success) {
        await replyToMessage(
            jid,
            `🍺 *#${number}* — ${senderName}`,
            message
        );
        await celebrateIfMilestone(jid, number, senderName, message);
    }
}

/**
 * Celebra milestones (100, 1000)
 */
async function celebrateIfMilestone(
    jid: string,
    number: number,
    senderName: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    if (number % 1000 === 0) {
        const progress = counterService.getProgress();
        await replyToMessage(
            jid,
            `🏆 *${number} CERVEJAS!* 🏆\n\n` +
            `${senderName} marcou o milhar!\n` +
            `Progresso: ${progress.percentage}% da meta! 🎯`,
            message
        );
    } else if (number % 100 === 0) {
        await replyToMessage(
            jid,
            `🎉 *${number} cervejas!* ${senderName} marcou a centena! 🍺🍺🍺`,
            message
        );
    }
}

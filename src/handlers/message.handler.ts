import { proto, WAMessageKey } from '@whiskeysockets/baileys';
import { config } from '../config/env.js';
import { parseCountFromMessage } from '../core/parser.js';
import { counterService } from '../core/counter.js';
import { reactToMessage, replyToMessage, setFallbackJid } from '../services/whatsapp.js';
import { logger } from '../utils/logger.js';
import { handleCommand } from './command.handler.js';
import { messageQueue } from '../utils/queue.js';
import { maybeGetDonateHint } from '../config/donate.js';
import {
    MILESTONE_HUNDRED,
    MILESTONE_THOUSAND,
    MILESTONE_TEN_THOUSAND,
    MILESTONE_FIFTY_THOUSAND,
    MILESTONE_HUNDRED_THOUSAND,
} from '../config/constants.js';

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
function getSenderId(message: proto.IWebMessageInfo): string | null {
    const id = message.key?.participant || message.key?.remoteJid || null;
    if (!id || id === '') {
        return null;
    }
    return id;
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
    // MODO DESCOBERTA: Se não tem GROUP_ID, só loga e não processa nada
    if (!config.groupId) {
        logger.info({ event: 'group_discovered', groupId: jid });
        console.log(`\n📋 Mensagem recebida do grupo: ${jid}`);
        console.log(`   Use este ID no .env: GROUP_ID=${jid}\n`);
        return; // ← NÃO PROCESSA, só descobre o ID
    }

    const senderId = getSenderId(message);
    if (!senderId) {
        logger.warn({ event: 'message_without_sender', jid });
        return;
    }

    const senderName = getSenderName(message);

    // Define o JID do remetente como fallback para DMs.
    // Em grupos LID, participant é @lid (não funciona pra DM).
    // participantAlt contém o @s.whatsapp.net que funciona.
    const key = message.key as WAMessageKey;
    const dmJid = key.participantAlt || senderId;
    setFallbackJid(dmJid);

    // Verifica se é um comando
    if (text?.startsWith('/')) {
        await handleCommand(message, text, senderId, senderName, jid);
        setFallbackJid(null); // Limpa depois do processamento
        return;
    }

    // ============================================
    // MODO AUTO-CONTAGEM: Foto sem número ou qualquer erro
    // ============================================

    // Se mandou imagem, processa automaticamente
    if (messageHasImage) {
        await messageQueue.add(async () => {
            const parsed = text ? parseCountFromMessage(text) : { success: false, number: null, raw: '' };
            const currentCount = await counterService.getCurrentCount();
            const nextNumber = currentCount + 1;

            logger.debug({
                event: 'image_processing',
                sender: senderName,
                parsed: parsed.number,
                expected: nextNumber,
            });

            // Caso 1: Foto SEM número - auto-conta
            if (!parsed.success || parsed.number === null) {
                const result = await counterService.attemptCount({
                    number: nextNumber,
                    userId: senderId,
                    userName: senderName,
                    messageId: message.key?.id || undefined,
                    hasImage: true,
                });

                if (result.success) {
                    const totalBeers = result.userTotal || 1;

                    // Reage e responde
                    await reactToMessage(jid, message.key!, '🍺');
                    await replyToMessage(
                        jid,
                        `🍺 *#${nextNumber}* — ${senderName} (${totalBeers}ª)`,
                        message
                    );
                    await celebrateIfMilestone(jid, nextNumber, senderName, message);

                    logger.info({
                        event: 'auto_count_success',
                        number: nextNumber,
                        sender: senderName,
                        senderId,
                        totalBeers,
                    });
                } else {
                    // Falhou - informa o erro
                    logger.warn({
                        event: 'auto_count_failed',
                        number: nextNumber,
                        sender: senderName,
                        reason: result.validation.status,
                    });
                    await reactToMessage(jid, message.key!, '⚠️');
                    await replyToMessage(jid, result.validation.message, message);
                }
                return;
            }

            // Caso 2: Foto COM número CERTO
            if (parsed.number === nextNumber) {
                const result = await counterService.attemptCount({
                    number: nextNumber,
                    userId: senderId,
                    userName: senderName,
                    messageId: message.key?.id || undefined,
                    hasImage: true,
                });

                if (result.success) {
                    await reactToMessage(jid, message.key!, '✅');
                    await celebrateIfMilestone(jid, nextNumber, senderName, message);

                    logger.info({
                        event: 'correct_count',
                        number: nextNumber,
                        sender: senderName,
                        senderId,
                    });
                } else {
                    // Alguém foi mais rápido
                    logger.info({
                        event: 'race_condition',
                        attemptedNumber: nextNumber,
                        sender: senderName,
                    });
                    const newNext = await counterService.getCurrentCount() + 1;
                    await autoCount(jid, newNext, senderId, senderName, message);
                }
                return;
            }

            // Caso 3: Foto COM número ERRADO - corrige automaticamente
            const result = await counterService.attemptCount({
                number: nextNumber,
                userId: senderId,
                userName: senderName,
                messageId: message.key?.id || undefined,
                hasImage: true,
            });

            if (result.success) {
                const totalBeers = result.userTotal || 1;

                await reactToMessage(jid, message.key!, '⚠️');
                await replyToMessage(
                    jid,
                    `⚠️ Ops! Era *#${nextNumber}*, não ${parsed.number}.\n🍺 Corrigido: *#${nextNumber}* — ${senderName} (${totalBeers}ª)`,
                    message
                );
                await celebrateIfMilestone(jid, nextNumber, senderName, message);

                logger.info({
                    event: 'wrong_number_corrected',
                    attempted: parsed.number,
                    correctedTo: nextNumber,
                    sender: senderName,
                    senderId,
                    totalBeers,
                });
            } else {
                // Falhou ao corrigir
                logger.warn({
                    event: 'correction_failed',
                    attempted: parsed.number,
                    expected: nextNumber,
                    sender: senderName,
                    reason: result.validation.status,
                });
                await reactToMessage(jid, message.key!, '❌');
                await replyToMessage(jid, result.validation.message, message);
            }
        });
        return;
    }

    // ============================================
    // MENSAGEM SEM IMAGEM - IGNORA CONTAGEM
    // ============================================
    // Pessoas conversam no grupo, então números sem foto são ignorados
    // Isso evita contar mensagens de conversa como cervejas

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
    const result = await counterService.attemptCount({
        number,
        userId: senderId,
        userName: senderName,
        messageId: message.key?.id || undefined,
        hasImage: true,
    });

    if (result.success) {
        await reactToMessage(jid, message.key!, '🍺');
        await replyToMessage(
            jid,
            `🍺 *#${number}* — ${senderName}`,
            message
        );
        await celebrateIfMilestone(jid, number, senderName, message);

        logger.info({
            event: 'auto_count_after_race',
            number,
            sender: senderName,
            senderId,
        });
    } else {
        logger.warn({
            event: 'auto_count_after_race_failed',
            number,
            sender: senderName,
            reason: result.validation.status,
        });
    }
}

/**
 * Celebra milestones (100, 1000, 10k, 50k, 100k)
 */
async function celebrateIfMilestone(
    jid: string,
    number: number,
    senderName: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    // Milestones especiais (maiores primeiro)
    if (number === MILESTONE_HUNDRED_THOUSAND) {
        const progress = await counterService.getProgress();
        await replyToMessage(
            jid,
            `🏆🏆🏆 *100.000 CERVEJAS!* 🏆🏆🏆\n\n` +
            `🌟 ${senderName} entrou para a HISTÓRIA!\n` +
            `📊 Já são ${progress.percentage}% da meta!\n` +
            `💎 LENDÁRIO! O milhão está cada vez mais perto! 🎯`,
            message
        );
        return;
    }

    if (number === MILESTONE_FIFTY_THOUSAND) {
        const progress = await counterService.getProgress();
        await replyToMessage(
            jid,
            `🎊🎊 *50.000 CERVEJAS!* 🎊🎊\n\n` +
            `⭐ ${senderName} marcou METADE dos 100k!\n` +
            `📊 Progresso: ${progress.percentage}%\n` +
            `🚀 Continua assim que o milhão vem! 🍺`,
            message
        );
        return;
    }

    if (number === MILESTONE_TEN_THOUSAND) {
        const progress = await counterService.getProgress();
        await replyToMessage(
            jid,
            `🎆🎆 *10.000 CERVEJAS!* 🎆🎆\n\n` +
            `🌟 ${senderName} marcou os 10k!\n` +
            `📊 Progresso: ${progress.percentage}%\n` +
            `💪 Bora rumo aos 100k! 🍺🍺🍺`,
            message
        );
        return;
    }

    // Milhar
    if (number % MILESTONE_THOUSAND === 0) {
        const progress = await counterService.getProgress();
        await replyToMessage(
            jid,
            `🏆 *${number} CERVEJAS!* 🏆\n\n` +
            `${senderName} marcou o milhar!\n` +
            `Progresso: ${progress.percentage}% da meta! 🎯` +
            maybeGetDonateHint(),
            message
        );
        return;
    }

    // Centena
    if (number % MILESTONE_HUNDRED === 0) {
        await replyToMessage(
            jid,
            `🎉 *${number} cervejas!* ${senderName} marcou a centena! 🍺🍺🍺` +
            maybeGetDonateHint(),
            message
        );
    }
}

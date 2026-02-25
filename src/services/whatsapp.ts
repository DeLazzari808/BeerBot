import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    WASocket,
    proto,
    WAMessageKey,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import qrcode from 'qrcode-terminal';
import { config } from '../config/env.js';
import { logger, baileyLogger } from '../utils/logger.js';
import {
    WHATSAPP_RECONNECT_BASE_DELAY_MS,
    WHATSAPP_RECONNECT_MAX_DELAY_MS,
} from '../config/constants.js';

let sock: WASocket | null = null;
let reconnectAttempts = 0;
let hasForceLoggedOut = false;

export type MessageHandler = (message: proto.IWebMessageInfo) => Promise<void>;
export type DeleteHandler = (messageId: string, jid: string) => Promise<void>;

let messageHandler: MessageHandler | null = null;
let deleteHandler: DeleteHandler | null = null;

export function setMessageHandler(handler: MessageHandler): void {
    messageHandler = handler;
}

export function setDeleteHandler(handler: DeleteHandler): void {
    deleteHandler = handler;
}

/**
 * Calcula delay de reconexão com backoff exponencial
 */
function getReconnectDelay(): number {
    const delay = Math.min(
        WHATSAPP_RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts),
        WHATSAPP_RECONNECT_MAX_DELAY_MS
    );
    reconnectAttempts++;
    return delay;
}

/**
 * Reseta contador de reconexão após conexão bem-sucedida
 */
function resetReconnectAttempts(): void {
    reconnectAttempts = 0;
}

export async function connectWhatsApp(): Promise<WASocket> {
    // Força logout apenas na PRIMEIRA tentativa de conexão do processo
    if (process.env.FORCE_LOGOUT === 'true' && !hasForceLoggedOut) {
        hasForceLoggedOut = true;
        logger.warn({ event: 'force_logout_triggered' });
        if (fs.existsSync(config.paths.auth)) {
            fs.rmSync(config.paths.auth, { recursive: true, force: true });
            logger.info({ event: 'auth_directory_cleared' });
        }
    }

    // Garante que o diretório de auth existe
    if (!fs.existsSync(config.paths.auth)) {
        fs.mkdirSync(config.paths.auth, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(config.paths.auth);

    sock = makeWASocket({
        auth: state,
        logger: baileyLogger,
        // Usando um browser mais comum para evitar erro 405
        browser: ['Ubuntu', 'Chrome', '110.0.5563.147'],
        printQRInTerminal: true, // Baileys tem um fallback interno melhor para QR
    });

    // Salva credenciais quando atualizadas
    sock.ev.on('creds.update', saveCreds);

    // Handler de conexão
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            logger.info({ event: 'qr_code_generated' });
            console.log('\n--- QR CODE ABAIXO ---');
            // Mantemos o qrcode-terminal como redundância
            qrcode.generate(qr, { small: true });
            console.log('----------------------\n');
        }

        if (connection === 'close') {
            const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
            logger.info({ event: 'connection_closed', reason });

            if (reason === DisconnectReason.loggedOut) {
                logger.error({ event: 'whatsapp_logged_out' });
                fs.rmSync(config.paths.auth, { recursive: true, force: true });
                process.exit(1);
            } else if (reason === 405) {
                // 405 = session rejected — clear auth and retry with long delay
                logger.warn({ event: 'whatsapp_405_session_rejected', reconnectAttempt: reconnectAttempts });
                fs.rmSync(config.paths.auth, { recursive: true, force: true });
                const delay = Math.max(15000, getReconnectDelay());
                setTimeout(() => {
                    connectWhatsApp();
                }, delay);
            } else if (reason === 428) {
                logger.error({ event: 'whatsapp_logged_out' });
                fs.rmSync(config.paths.auth, { recursive: true, force: true });
                process.exit(1);
            } else if (reason === 405) {
                // 405 = session rejected — clear auth and retry with long delay
                // Don't process.exit — just clean auth and reconnect
                logger.warn({ event: 'whatsapp_405_session_rejected', reconnectAttempt: reconnectAttempts });
                fs.rmSync(config.paths.auth, { recursive: true, force: true });
                const delay = Math.max(10000, getReconnectDelay());
                setTimeout(() => {
                    connectWhatsApp();
                }, delay);
            } else if (reason === 428) {
                // 428 = rate limit — fast reconnect
                const delay = 2000;
                logger.warn({
                    event: 'whatsapp_428_rate_limit',
                    reconnectAttempt: reconnectAttempts,
                    delayMs: delay,
                });
                reconnectAttempts++;
                setTimeout(() => {
                    connectWhatsApp();
                }, delay);
            } else {
                const delay = getReconnectDelay();
                logger.warn({
                    event: 'whatsapp_disconnected',
                    reason,
                    reconnectAttempt: reconnectAttempts,
                    delayMs: delay,
                });
                setTimeout(() => {
                    connectWhatsApp();
                }, delay);
            }
        } else if (connection === 'open') {
            resetReconnectAttempts();
            logger.info({ event: 'whatsapp_connected' });
        }
    });

    // Handler de mensagens
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        logger.debug({ event: 'messages_upsert', type, count: messages.length });

        if (type !== 'notify') return;

        for (const message of messages) {
            const jid = message.key?.remoteJid || 'unknown';
            const fromMe = message.key?.fromMe;

            logger.debug({ event: 'message_received', jid, fromMe });

            // Ignora mensagens de si mesmo
            if (message.key.fromMe) continue;

            // Processa apenas se tiver handler
            if (messageHandler) {
                try {
                    await messageHandler(message);
                } catch (error) {
                    logger.error({
                        event: 'message_handler_error',
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        }
    });

    // Handler de mensagens deletadas
    sock.ev.on('messages.update', async (updates) => {
        for (const update of updates) {
            // Verifica se foi deletada
            if (update.update?.messageStubType === 1) { // 1 = REVOKE
                const messageId = update.key?.id;
                const jid = update.key?.remoteJid || '';

                logger.info({ event: 'message_deleted', messageId, jid });

                if (messageId && deleteHandler) {
                    try {
                        await deleteHandler(messageId, jid);
                    } catch (error) {
                        logger.error({
                            event: 'delete_handler_error',
                            messageId,
                            error: error instanceof Error ? error.message : String(error),
                        });
                    }
                }
            }
        }
    });

    return sock;
}

export function getSocket(): WASocket | null {
    return sock;
}

/**
 * Envia mensagem de texto
 */
export async function sendMessage(jid: string, text: string): Promise<void> {
    if (!sock) throw new Error('Socket não conectado');
    logger.debug({ event: 'message_sent', jid, textLength: text.length });
    await sock.sendMessage(jid, { text });
}

/**
 * Responde a uma mensagem
 */
export async function replyToMessage(
    jid: string,
    text: string,
    quotedMessage: proto.IWebMessageInfo
): Promise<void> {
    if (!sock) throw new Error('Socket não conectado');
    logger.debug({ event: 'reply_sent', jid, textLength: text.length });
    await sock.sendMessage(jid, { text }, { quoted: quotedMessage as any });
}

/**
 * Reage a uma mensagem.
 * Wrapped in try/catch because reactions use SenderKey encryption
 * which may fail for some participants in LID groups. Reactions are
 * cosmetic so failures are silently logged.
 */
export async function reactToMessage(
    jid: string,
    messageKey: WAMessageKey,
    emoji: string
): Promise<void> {
    if (!sock) return;
    try {
        logger.debug({ event: 'reaction_sent', jid, emoji });
        await sock.sendMessage(jid, {
            react: {
                text: emoji,
                key: messageKey,
            },
        });
    } catch (error) {
        logger.warn({
            event: 'reaction_failed',
            jid,
            emoji,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

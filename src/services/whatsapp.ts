import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    WASocket,
    proto,
    WAMessageKey,
    GroupMetadata,
    fetchLatestBaileysVersion,
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

// Cache de metadados de grupo com participantes @lid removidos
// Impede que Baileys tente resolver chaves de criptografia para dispositivos @lid,
// que causa um crash 1006 no WebSocket ao enviar mensagens para o grupo.
const groupMetadataCache = new Map<string, GroupMetadata>();

let sock: WASocket | null = null;
let reconnectAttempts = 0;
let consecutive428Count = 0;
let lastConnectionOpenTime = 0;

// JID do remetente atual para fallback DM em grupos LID.
// Setado pelo message handler antes de processar cada mensagem.
let currentFallbackJid: string | null = null;

/**
 * Define o JID de fallback para DM quando envio ao grupo falhar.
 * Deve ser chamado pelo handler antes de processar cada mensagem.
 */
export function setFallbackJid(jid: string | null): void {
    currentFallbackJid = jid;
}

// Constantes para controle de 428
const STABLE_CONNECTION_THRESHOLD_MS = 30_000; // 30s para considerar conexão estável
const ERROR_428_BASE_DELAY_MS = 30_000; // 30s de delay base para 428
const ERROR_428_MAX_DELAY_MS = 5 * 60_000; // 5 min de delay máximo para 428
const ERROR_428_COOLDOWN_THRESHOLD = 5; // Após 5 428s consecutivos, entra em cooldown
const ERROR_428_COOLDOWN_MS = 10 * 60_000; // 10 min de cooldown

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
function getReconnectDelay(reason?: number): number {
    // Tratamento especial para erro 428
    if (reason === 428) {
        consecutive428Count++;

        // Após muitas tentativas 428, entra em cooldown longo
        if (consecutive428Count >= ERROR_428_COOLDOWN_THRESHOLD) {
            logger.error({
                event: 'whatsapp_428_cooldown',
                consecutive428Count,
                cooldownMs: ERROR_428_COOLDOWN_MS,
            });
            console.log(`\n⏳ Muitos erros 428 consecutivos (${consecutive428Count}x). Aguardando ${ERROR_428_COOLDOWN_MS / 60_000} minutos antes de reconectar...\n`);
            return ERROR_428_COOLDOWN_MS;
        }

        // Backoff progressivo para 428: 30s, 60s, 120s, 240s, max 5min
        const delay = Math.min(
            ERROR_428_BASE_DELAY_MS * Math.pow(2, consecutive428Count - 1),
            ERROR_428_MAX_DELAY_MS
        );
        return delay;
    }

    // Para outros erros, usa o backoff normal
    const delay = Math.min(
        WHATSAPP_RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts),
        WHATSAPP_RECONNECT_MAX_DELAY_MS
    );
    reconnectAttempts++;
    return delay;
}

/**
 * Reseta contadores apenas se a conexão foi estável (30+ segundos)
 */
function resetReconnectAttempts(): void {
    const now = Date.now();
    const connectionDuration = lastConnectionOpenTime > 0 ? now - lastConnectionOpenTime : 0;

    if (connectionDuration >= STABLE_CONNECTION_THRESHOLD_MS || lastConnectionOpenTime === 0) {
        reconnectAttempts = 0;
        consecutive428Count = 0;
        if (lastConnectionOpenTime > 0) {
            logger.info({
                event: 'connection_stabilized',
                durationMs: connectionDuration,
            });
        }
    }

    lastConnectionOpenTime = now;
}

export async function connectWhatsApp(): Promise<WASocket> {
    // Garante que o diretório de auth existe
    if (!fs.existsSync(config.paths.auth)) {
        fs.mkdirSync(config.paths.auth, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(config.paths.auth);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info({ event: 'whatsapp_version_fetched', version, isLatest });

    sock = makeWASocket({
        version,
        auth: state,
        logger: baileyLogger,
        browser: ['Mac OS', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        connectTimeoutMs: 60_000,
        keepAliveIntervalMs: 30_000,
        retryRequestDelayMs: 500,
        generateHighQualityLinkPreview: false,
        // Fornece metadata de grupo pré-filtrada, sem participantes @lid
        // Isso evita que Baileys passe JIDs @lid para o USyncQuery,
        // que causava um crash 1006 ao tentar resolver chaves de criptografia
        cachedGroupMetadata: async (jid) => groupMetadataCache.get(jid),
        getMessage: async (key) => {
            return {
                conversation: '...',
            };
        },
    });

    // QR Code é exibido via connection.update (abaixo)
    // Autenticação via Web Client (completa) — necessária para sincronizar chaves de grupos

    // Salva credenciais quando atualizadas
    sock.ev.on('creds.update', saveCreds);

    // Handler de conexão
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            logger.info({ event: 'qr_code_generated' });
            console.log('\n📱 Escaneie o QR Code abaixo para conectar:\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;

            if (reason === DisconnectReason.loggedOut) {
                logger.error({ event: 'whatsapp_logged_out' });
                fs.rmSync(config.paths.auth, { recursive: true, force: true });
                process.exit(1);
            } else {
                const delay = getReconnectDelay(reason);
                logger.warn({
                    event: 'whatsapp_disconnected',
                    reason,
                    reconnectAttempt: reconnectAttempts,
                    consecutive428: consecutive428Count,
                    delayMs: delay,
                });
                console.log(`⚠️ Desconectado (reason: ${reason}). Reconectando em ${Math.round(delay / 1000)}s...`);
                setTimeout(() => {
                    connectWhatsApp();
                }, delay);
            }
        } else if (connection === 'open') {
            resetReconnectAttempts();
            logger.info({ event: 'whatsapp_connected' });

            // Pré-carrega metadata do grupo para envio de mensagens.
            // Baileys 7.0.0-rc.9 tem suporte nativo a grupos LID —
            // cachear metadata REAL sem modificações.
            if (config.groupId && sock) {
                const currentSock = sock;
                setTimeout(async () => {
                    try {
                        const metadata = await currentSock.groupMetadata(config.groupId!);
                        groupMetadataCache.set(config.groupId!, metadata);
                        logger.info({
                            event: 'group_metadata_cached',
                            total: metadata.participants.length,
                            addressingMode: metadata.addressingMode,
                        });
                    } catch (err) {
                        logger.warn({ event: 'group_metadata_prefetch_failed', error: String(err) });
                    }
                }, 3000);
            }
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
 * Retry com backoff para erros 428 (Precondition Required)
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            const statusCode = error?.output?.statusCode || error?.statusCode;
            if (statusCode === 428 && i < maxRetries - 1) {
                const delay = (i + 1) * 2000;
                logger.warn({ event: 'retry_after_428', attempt: i + 1, delayMs: delay });
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw error;
        }
    }
    throw new Error('Max retries exceeded');
}

// =====================================================================
// Grupos LID: Baileys NÃO consegue enviar mensagens para grupos com
// addressingMode 'lid' (USyncQuery não suporta JIDs @lid — feature
// incompleta do Baileys). O bot RECEBE mensagens normalmente, mas
// enviar para o grupo causa crash 1006 ou 428.
//
// Solução: tentar enviar para o grupo; se falhar, enviar DM para o
// remetente do comando. DMs usam criptografia pairwise (Signal),
// diferente de sender key (grupo), e funcionam com @lid.
// =====================================================================

/**
 * Envia mensagem de texto. Se falhar, tenta enviar DM para fallbackJid.
 */
export async function sendMessage(
    jid: string,
    text: string,
    fallbackJid?: string,
): Promise<void> {
    if (!sock) throw new Error('Socket não conectado');

    try {
        await withRetry(() => sock!.sendMessage(jid, { text }));
        logger.debug({ event: 'message_sent', jid, textLength: text.length });
    } catch (error: any) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.warn({ event: 'group_send_failed', jid, error: errMsg });

        // Fallback: DM para o remetente
        const dmJid = fallbackJid || currentFallbackJid;
        if (dmJid && dmJid !== jid) {
            try {
                await sock!.sendMessage(dmJid, {
                    text: `[BeerBot 🍺]\n\n${text}`,
                });
                logger.info({
                    event: 'dm_fallback_sent',
                    originalJid: jid,
                    fallbackJid: dmJid,
                });
            } catch (dmError: any) {
                logger.error({
                    event: 'dm_fallback_failed',
                    fallbackJid: dmJid,
                    error: dmError instanceof Error ? dmError.message : String(dmError),
                });
            }
        }
    }
}

/**
 * Responde a uma mensagem
 */
export async function replyToMessage(
    jid: string,
    text: string,
    quotedMessage: proto.IWebMessageInfo,
    fallbackJid?: string,
): Promise<void> {
    if (!sock) throw new Error('Socket não conectado');

    try {
        // Para participantes @lid, não usar quoted (corrompe sessão)
        const participant = quotedMessage.key?.participant || quotedMessage.key?.remoteJid || '';
        if (participant.includes('@lid')) {
            await withRetry(() => sock!.sendMessage(jid, { text }));
        } else {
            await withRetry(() => sock!.sendMessage(jid, { text }, { quoted: quotedMessage as any }));
        }
        logger.debug({ event: 'reply_sent', jid, textLength: text.length });
    } catch (error: any) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.warn({ event: 'group_reply_failed', jid, error: errMsg });

        // Fallback: DM para o remetente
        const dmJid = fallbackJid || quotedMessage.key?.participant || '';
        if (dmJid && dmJid !== jid) {
            try {
                await sock!.sendMessage(dmJid, {
                    text: `[BeerBot 🍺]\n\n${text}`,
                });
                logger.info({
                    event: 'dm_fallback_sent',
                    originalJid: jid,
                    fallbackJid: dmJid,
                });
            } catch (dmError: any) {
                logger.error({
                    event: 'dm_fallback_failed',
                    fallbackJid: dmJid,
                    error: dmError instanceof Error ? dmError.message : String(dmError),
                });
            }
        }
    }
}

/**
 * Reage a uma mensagem
 */
export async function reactToMessage(
    jid: string,
    messageKey: WAMessageKey,
    emoji: string
): Promise<void> {
    if (!sock) throw new Error('Socket não conectado');

    // Silenciosamente ignora reações em grupos LID (sempre causam crash)
    try {
        await withRetry(() => sock!.sendMessage(jid, {
            react: {
                text: emoji,
                key: messageKey,
            },
        }));
        logger.debug({ event: 'reaction_sent', jid, emoji });
    } catch (error: any) {
        // Reações falhando não devem impedir o fluxo
        logger.warn({
            event: 'reaction_failed',
            jid,
            emoji,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}


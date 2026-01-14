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

let sock: WASocket | null = null;

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

export async function connectWhatsApp(): Promise<WASocket> {
    // Garante que o diretório de auth existe
    if (!fs.existsSync(config.paths.auth)) {
        fs.mkdirSync(config.paths.auth, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(config.paths.auth);

    sock = makeWASocket({
        auth: state,
        logger: baileyLogger,
        browser: ['BeerBot', 'Chrome', '1.0.0'],
    });

    // Salva credenciais quando atualizadas
    sock.ev.on('creds.update', saveCreds);

    // Handler de conexão
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n📱 Escaneie o QR Code abaixo para conectar:\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;

            if (reason === DisconnectReason.loggedOut) {
                logger.error('Desconectado! Deletando credenciais...');
                fs.rmSync(config.paths.auth, { recursive: true, force: true });
                process.exit(1);
            } else {
                logger.warn('Conexão fechada, reconectando...');
                connectWhatsApp();
            }
        } else if (connection === 'open') {
            logger.info('🍺 Bot conectado com sucesso!');
        }
    });

    // Handler de mensagens
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        console.log(`📨 Evento recebido - tipo: ${type}, qtd: ${messages.length}`);

        if (type !== 'notify') return;

        for (const message of messages) {
            const jid = message.key?.remoteJid || 'desconhecido';
            const fromMe = message.key?.fromMe;
            console.log(`📩 Mensagem de: ${jid} | fromMe: ${fromMe}`);

            // Ignora mensagens de si mesmo
            if (message.key.fromMe) continue;

            // Processa apenas se tiver handler
            if (messageHandler) {
                try {
                    await messageHandler(message);
                } catch (error) {
                    logger.error({ error }, 'Erro ao processar mensagem');
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
                if (messageId && deleteHandler) {
                    try {
                        await deleteHandler(messageId, update.key?.remoteJid || '');
                    } catch (error) {
                        logger.error({ error }, 'Erro ao processar deleção');
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
    await sock.sendMessage(jid, { text }, { quoted: quotedMessage as any });
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
    await sock.sendMessage(jid, {
        react: {
            text: emoji,
            key: messageKey,
        },
    });
}

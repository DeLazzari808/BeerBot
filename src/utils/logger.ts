import pino from 'pino';

export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
});

// Logger silencioso para Baileys (reduz spam)
export const baileyLogger = pino({ level: 'silent' });

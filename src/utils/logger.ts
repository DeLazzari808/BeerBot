import pino from 'pino';

export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
});

// Logger para Baileys — 'warn' para diagnosticar problemas de conexao
export const baileyLogger = pino({ level: 'warn' });

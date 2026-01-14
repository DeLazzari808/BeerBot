import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
    // ID do grupo alvo (formato: xxxxx@g.us)
    groupId: process.env.GROUP_ID || '',

    // Contagem inicial (caso o bot entre no meio da contagem)
    initialCount: parseInt(process.env.INITIAL_COUNT || '0', 10),

    // Números dos admins (podem usar comandos especiais)
    adminNumbers: (process.env.ADMIN_NUMBERS || '')
        .split(',')
        .map(n => n.trim())
        .filter(Boolean),

    // Caminhos
    paths: {
        database: path.join(process.cwd(), 'data', 'beer.db'),
        auth: path.join(process.cwd(), 'auth_info'),
    },

    // Prefixo de comandos
    commandPrefix: '/',
};

export type Config = typeof config;

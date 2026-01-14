// Script para disparar recap manualmente
import { sendDailyRecap } from './services/scheduler.js';
import { getDatabase } from './database/sqlite.js';

// Inicializa banco
getDatabase();

// Dispara recap
sendDailyRecap()
    .then(() => {
        console.log('✅ Recap enviado!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Erro:', err);
        process.exit(1);
    });

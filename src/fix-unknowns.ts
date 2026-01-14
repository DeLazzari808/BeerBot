// Corrige Desconhecidos - renomeia para o telefone ou identifica
import { getDatabase, closeDatabase } from './database/sqlite.js';

const db = getDatabase();

// O líder "Desconhecido" tem ID 351925914169 - é português, provavelmente é um usuário recorrente
// Vamos manter como "Usuário PT +351..." até identificar

// Renomeia o líder
db.prepare("UPDATE users SET name = 'Usuário PT 351' WHERE id LIKE '%351925914169%'").run();

// Garante que Daniel Anspach está com nome correto
db.prepare("UPDATE users SET name = 'Daniel Anspach' WHERE id LIKE '%111270237864004%'").run();

// Ezio
db.prepare("UPDATE users SET name = 'Ezio' WHERE id LIKE '%275251669799052%'").run();

console.log('📊 TOP 10 CORRIGIDO:');
const top = db.prepare('SELECT id, name, total_count FROM users ORDER BY total_count DESC LIMIT 10').all() as any[];
top.forEach((u, i) => {
    const medals = ['🥇', '🥈', '🥉'];
    const medal = medals[i] || `${i + 1}.`;
    console.log(`${medal} ${u.name}: ${u.total_count} (${u.id.substring(0, 20)}...)`);
});

closeDatabase();

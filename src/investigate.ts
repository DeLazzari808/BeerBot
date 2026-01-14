// Investigar Desconhecido com 16 cervejas
import { getDatabase, closeDatabase } from './database/sqlite.js';

const db = getDatabase();

// Busca quem é o Desconhecido líder
console.log('🔍 Top 10 atual:');
const top = db.prepare('SELECT id, name, total_count FROM users ORDER BY total_count DESC LIMIT 10').all() as any[];
top.forEach((u, i) => console.log(`  ${i + 1}. ${u.name}: ${u.total_count} (${u.id})`));

// Busca contagens do líder desconhecido
console.log('\n🔍 Contagens do líder (se for Desconhecido):');
const leaderId = top[0]?.id;
if (leaderId) {
    const counts = db.prepare('SELECT number FROM counts WHERE user_id = ? ORDER BY number').all(leaderId) as any[];
    console.log(`  Números: ${counts.map(c => c.number).join(', ')}`);
}

// Mostra todos os Desconhecidos
console.log('\n👥 Todos os "Desconhecido":');
const unknowns = db.prepare("SELECT id, total_count FROM users WHERE name = 'Desconhecido' ORDER BY total_count DESC").all() as any[];
unknowns.forEach(u => console.log(`  ${u.total_count} cervejas: ${u.id}`));

closeDatabase();

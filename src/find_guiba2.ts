// Buscar usuários
import Database from 'better-sqlite3';

const db = new Database('./data/beer.db', { readonly: true });

console.log('=== TOP 20 USUARIOS ===\n');
const top = db.prepare('SELECT id, name, total_count FROM users ORDER BY total_count DESC LIMIT 20').all() as any[];
top.forEach((u, i) => {
    console.log(`${i + 1}. ${u.name} (${u.total_count}) - ID: ${u.id}`);
});

console.log('\n=== BUSCA GUIBA ===\n');
const guiba = db.prepare("SELECT * FROM users WHERE name LIKE '%guiba%' COLLATE NOCASE").all() as any[];
console.log('Resultados:', guiba);

console.log('\n=== TODOS COM 4 CERVEJAS ===\n');
const quatro = db.prepare('SELECT id, name, total_count FROM users WHERE total_count = 4').all() as any[];
quatro.forEach(u => console.log(`${u.name}: ${u.total_count} - ${u.id}`));

db.close();

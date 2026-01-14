// Corrige o nome do líder
import { getDatabase, closeDatabase } from './database/sqlite.js';

const db = getDatabase();

// Mostra top 5
console.log('📊 TOP 5 antes:');
const top = db.prepare('SELECT id, name, total_count FROM users ORDER BY total_count DESC LIMIT 5').all() as any[];
top.forEach((u, i) => console.log(`  ${i + 1}. ${u.name}: ${u.total_count} (${u.id})`));

// Atualiza os "Desconhecido" que são na verdade Daniel Anspach
db.prepare(`
  UPDATE users SET name = 'Daniel Anspach' 
  WHERE id LIKE '%351910698784%' OR id = '351910698784@s.whatsapp.net'
`).run();

// Mostra depois
console.log('\n📊 TOP 5 depois:');
const top2 = db.prepare('SELECT id, name, total_count FROM users ORDER BY total_count DESC LIMIT 5').all() as any[];
top2.forEach((u, i) => console.log(`  ${i + 1}. ${u.name}: ${u.total_count} (${u.id})`));

closeDatabase();

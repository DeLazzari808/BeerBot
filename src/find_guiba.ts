// Buscar usuário Guiba e seus registros
import { getDatabase, closeDatabase } from './database/sqlite.js';

const db = getDatabase();

console.log('🔍 Buscando usuários com "Guiba" no nome:');
const guibaUsers = db.prepare("SELECT id, name, total_count FROM users WHERE name LIKE '%guiba%' OR name LIKE '%Guiba%' OR name LIKE '%GUIBA%' COLLATE NOCASE").all() as any[];
console.log(guibaUsers);

console.log('\n📊 Top 15 do ranking atual:');
const top = db.prepare('SELECT id, name, total_count FROM users ORDER BY total_count DESC LIMIT 15').all() as any[];
top.forEach((u, i) => console.log(`  ${i + 1}. ${u.name}: ${u.total_count} cervejas (${u.id})`));

console.log('\n👥 Todos os usuários únicos:');
const allUsers = db.prepare('SELECT id, name, total_count FROM users ORDER BY total_count DESC').all() as any[];
allUsers.forEach((u, i) => console.log(`  ${u.name}: ${u.total_count} cervejas - ID: ${u.id}`));

closeDatabase();

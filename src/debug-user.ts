// Debug para verificar formato dos IDs
import { getDatabase, closeDatabase } from './database/sqlite.js';
import { config } from './config/env.js';

console.log('📋 Admins configurados no .env:');
console.log(config.adminNumbers);

console.log('\n🔍 Últimas mensagens recebidas (user_id):');
const db = getDatabase();
const recent = db.prepare(`
  SELECT DISTINCT user_id, user_name FROM counts 
  ORDER BY number DESC LIMIT 20
`).all() as any[];

recent.forEach(r => {
    const isAdmin = config.adminNumbers.includes(r.user_id.replace('@s.whatsapp.net', ''));
    console.log(`  ${r.user_name}: ${r.user_id} ${isAdmin ? '✅ ADMIN' : ''}`);
});

// Busca Felpess especificamente
console.log('\n🍺 Registros do Felpess:');
const felpess = db.prepare(`
  SELECT number, user_id, user_name FROM counts 
  WHERE LOWER(user_name) LIKE '%felp%' OR user_id LIKE '%995272045%'
`).all() as any[];
felpess.forEach(f => console.log(`  #${f.number}: ${f.user_name} (${f.user_id})`));

console.log('\n👥 Usuários Felpess na tabela users:');
const felpUsers = db.prepare(`
  SELECT id, name, total_count FROM users 
  WHERE LOWER(name) LIKE '%felp%' OR id LIKE '%995272045%'
`).all() as any[];
felpUsers.forEach(f => console.log(`  ${f.name}: ${f.total_count} (${f.id})`));

closeDatabase();

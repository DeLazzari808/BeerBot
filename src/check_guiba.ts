// Verificar contagens do Guiba - output limpo
import Database from 'better-sqlite3';

const db = new Database('./data/beer.db', { readonly: true });

const guibaId = '249413062631456@lid';

console.log('=== USUARIO GUIBA ===');
const guiba = db.prepare('SELECT * FROM users WHERE id = ?').get(guibaId) as any;
console.log(JSON.stringify(guiba, null, 2));

console.log('\n=== TODAS AS CONTAGENS DO GUIBA ===');
const counts = db.prepare('SELECT number, created_at FROM counts WHERE user_id = ? ORDER BY created_at').all(guibaId) as any[];
console.log(`Total: ${counts.length} cervejas`);
console.log(JSON.stringify(counts, null, 2));

db.close();

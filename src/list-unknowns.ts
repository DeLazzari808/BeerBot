// Lista todos os Desconhecidos para usuário confirmar
import { getDatabase, closeDatabase } from './database/sqlite.js';

const db = getDatabase();

console.log('📋 USUÁRIOS "DESCONHECIDO" - PRECISO QUE CONFIRME OS NOMES:\n');

const unknowns = db.prepare(`
  SELECT DISTINCT u.id, u.name, u.total_count,
    (SELECT GROUP_CONCAT(c.number) FROM counts c WHERE c.user_id = u.id ORDER BY c.number) as beers
  FROM users u 
  WHERE u.name LIKE '%Desconhecido%' OR u.name LIKE '%Usuário%'
  ORDER BY u.total_count DESC
`).all() as any[];

unknowns.forEach((u, i) => {
    // Extrai o telefone do ID
    let phone = u.id.replace('@s.whatsapp.net', '').replace('@lid', '');
    console.log(`${i + 1}. Telefone: ${phone}`);
    console.log(`   Cervejas: ${u.total_count} (#${u.beers})`);
    console.log('');
});

console.log(`\nTotal: ${unknowns.length} usuários sem nome identificado`);

closeDatabase();

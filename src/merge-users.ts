// Script para unificar usuários com IDs diferentes
import { getDatabase, closeDatabase } from './database/sqlite.js';

const db = getDatabase();

// Mapeamento: novo_id -> id_antigo (para unificar)
// O novo formato @lid é o real do WhatsApp, vamos mover tudo pra ele
const mergeMap: Record<string, string[]> = {
    // Felpess: vai somar tudo no ID antigo e depois atualizar
};

// Busca todos os usuários duplicados (mesmo nome, IDs diferentes)
console.log('🔍 Buscando usuários duplicados...\n');

const duplicates = db.prepare(`
  SELECT name, GROUP_CONCAT(id) as ids, SUM(total_count) as total
  FROM users
  GROUP BY LOWER(name)
  HAVING COUNT(*) > 1
`).all() as any[];

console.log('📋 Usuários duplicados encontrados:');
duplicates.forEach(d => {
    console.log(`  ${d.name}: ${d.ids} (total: ${d.total})`);
});

// Para cada duplicado, mantém o primeiro ID e soma as contagens
for (const dup of duplicates) {
    const ids = dup.ids.split(',');
    const primaryId = ids[0]; // Mantém o primeiro
    const secondaryIds = ids.slice(1);

    console.log(`\n🔧 Unificando ${dup.name}:`);
    console.log(`   Primary: ${primaryId}`);
    console.log(`   Secundários: ${secondaryIds.join(', ')}`);

    // Atualiza contagens para o ID primário
    for (const secId of secondaryIds) {
        // Pega a contagem do secundário
        const secUser = db.prepare('SELECT total_count FROM users WHERE id = ?').get(secId) as any;
        if (secUser) {
            // Soma no primário
            db.prepare('UPDATE users SET total_count = total_count + ? WHERE id = ?')
                .run(secUser.total_count, primaryId);

            // Atualiza as contagens para apontar pro ID primário
            db.prepare('UPDATE counts SET user_id = ? WHERE user_id = ?')
                .run(primaryId, secId);

            // Remove o secundário
            db.prepare('DELETE FROM users WHERE id = ?').run(secId);

            console.log(`   ✅ Movido ${secUser.total_count} cervejas de ${secId}`);
        }
    }
}

// Mostra resultado final
console.log('\n📊 Resultado final:');
const finalUsers = db.prepare(`
  SELECT name, total_count FROM users 
  WHERE LOWER(name) LIKE '%felp%'
`).all() as any[];
finalUsers.forEach(u => console.log(`  ${u.name}: ${u.total_count} cervejas`));

closeDatabase();
console.log('\n✅ Unificação concluída!');

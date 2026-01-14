// Script de unificação TOTAL de usuários duplicados
import { getDatabase, closeDatabase } from './database/sqlite.js';

const db = getDatabase();

console.log('🔍 Buscando TODOS os usuários duplicados (mesmo nome)...\n');

// Busca todos os duplicados por nome
const duplicates = db.prepare(`
  SELECT LOWER(name) as lname, GROUP_CONCAT(id) as ids, SUM(total_count) as total, COUNT(*) as qty
  FROM users
  WHERE name != 'Desconhecido'
  GROUP BY LOWER(name)
  HAVING COUNT(*) > 1
  ORDER BY total DESC
`).all() as any[];

console.log(`📋 Encontrados ${duplicates.length} usuários com duplicatas:\n`);

let totalMerged = 0;

for (const dup of duplicates) {
    const ids = dup.ids.split(',');

    // Prioriza ID @lid (mais recente)
    const lidId = ids.find((id: string) => id.includes('@lid'));
    const primaryId = lidId || ids[0];
    const secondaryIds = ids.filter((id: string) => id !== primaryId);

    // Pega o nome do ID primário
    const primaryUser = db.prepare('SELECT name FROM users WHERE id = ?').get(primaryId) as any;
    const displayName = primaryUser?.name || dup.lname;

    console.log(`🔧 ${displayName}: ${ids.length} entradas → unificando em ${primaryId.substring(0, 20)}...`);

    for (const secId of secondaryIds) {
        const secUser = db.prepare('SELECT total_count FROM users WHERE id = ?').get(secId) as any;

        if (secUser) {
            // Soma no primário
            db.prepare('UPDATE users SET total_count = total_count + ? WHERE id = ?')
                .run(secUser.total_count, primaryId);

            // Move contagens
            db.prepare('UPDATE counts SET user_id = ?, user_name = ? WHERE user_id = ?')
                .run(primaryId, displayName, secId);

            // Remove secundário
            db.prepare('DELETE FROM users WHERE id = ?').run(secId);

            console.log(`   ✅ Movido ${secUser.total_count} de ${secId.substring(0, 20)}...`);
            totalMerged++;
        }
    }
}

// Também atualiza os "Desconhecido" que têm IDs conhecidos
console.log('\n🔧 Atualizando nomes de "Desconhecido" com IDs conhecidos...');

const knownUsers: Record<string, string> = {
    '351910698784': 'Daniel Anspach',
    '5541996244996': 'Ezio',
    '5541999844676': 'Jonatan Slompo',
    '5541996566128': 'Thiago Guimaraes',
    '5541995272045': 'Felpess',
    '5541992066601': 'Filipe',
    '5541995263014': 'Marcelo Xavier F',
    '5519996689336': 'Maria Rodrigues',
    '351911125518': 'Bitten',
    '5521996081009': 'Anna Lazaroni',
};

for (const [phone, name] of Object.entries(knownUsers)) {
    db.prepare(`UPDATE users SET name = ? WHERE id LIKE ? AND name = 'Desconhecido'`)
        .run(name, `%${phone}%`);
}

// Mostra resultado final
console.log('\n📊 TOP 10 FINAL:');
const top10 = db.prepare(`
  SELECT name, total_count FROM users 
  ORDER BY total_count DESC 
  LIMIT 10
`).all() as any[];

top10.forEach((u, i) => {
    const medals = ['🥇', '🥈', '🥉'];
    const medal = medals[i] || `${i + 1}.`;
    console.log(`${medal} ${u.name}: ${u.total_count} 🍺`);
});

console.log(`\n✅ Unificação concluída! ${totalMerged} entradas mescladas.`);

closeDatabase();

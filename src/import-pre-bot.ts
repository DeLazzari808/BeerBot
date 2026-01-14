/**
 * Script para importar ranking histórico PRÉ-BOT (antes do #3993)
 * Adiciona contagens aos usuários que já tinham cervejas antes do bot
 */

import { getDatabase, closeDatabase } from './database/sqlite.js';

// Ranking histórico antes do bot (pré-3993)
const historicalRanking: Array<{ name: string; oderId: string; count: number }> = [
    { name: 'Daniel Anspach', oderId: '351910698784@s.whatsapp.net', count: 7 },
    { name: 'Ze Afonso', oderId: 'zeafonso@s.whatsapp.net', count: 5 },
    { name: 'Enzo DN', oderId: '5543991421241@s.whatsapp.net', count: 5 },
    { name: 'Antonio Carlos Villa', oderId: '351911797264@s.whatsapp.net', count: 4 },
    { name: 'Joaquim Hilling', oderId: '351930462897@s.whatsapp.net', count: 5 },
    { name: 'Ezio', oderId: '5541996244996@s.whatsapp.net', count: 4 },
    { name: 'Pedro Fendrich', oderId: 'pedrofendrich@s.whatsapp.net', count: 3 },
    { name: 'Gabryel Haertel', oderId: 'gabryel@s.whatsapp.net', count: 3 },
    { name: 'Vitor', oderId: '5542991131357@s.whatsapp.net', count: 3 },
    { name: 'Marcelo Xavier F', oderId: '5541995263014@s.whatsapp.net', count: 3 },
];

async function importHistoricalRanking() {
    console.log('🍺 Importando ranking histórico PRÉ-BOT...\n');

    const db = getDatabase();

    // Para cada usuário, adiciona as contagens históricas
    const upsertUser = db.prepare(`
    INSERT INTO users (id, name, total_count, last_count_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = COALESCE(excluded.name, name),
      total_count = total_count + excluded.total_count
  `);

    let totalAdded = 0;

    for (const user of historicalRanking) {
        try {
            upsertUser.run(user.oderId, user.name, user.count);
            console.log(`✅ ${user.name}: +${user.count} cervejas históricas`);
            totalAdded += user.count;
        } catch (error) {
            console.error(`❌ Erro ao importar ${user.name}:`, error);
        }
    }

    console.log(`\n📊 Importação concluída!`);
    console.log(`   ✅ Total adicionado: ${totalAdded} cervejas`);

    // Mostra top 10 atualizado
    console.log('\n🏆 TOP 10 ATUALIZADO:');
    const top10 = db.prepare(`
    SELECT name, total_count 
    FROM users 
    ORDER BY total_count DESC 
    LIMIT 10
  `).all() as Array<{ name: string; total_count: number }>;

    top10.forEach((user, i) => {
        const medals = ['🥇', '🥈', '🥉'];
        const medal = medals[i] || `${i + 1}.`;
        console.log(`${medal} ${user.name} — ${user.total_count} 🍺`);
    });

    closeDatabase();
}

importHistoricalRanking().catch(console.error);

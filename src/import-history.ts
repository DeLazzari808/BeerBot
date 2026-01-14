/**
 * Script para importar dados históricos de cervejas
 * Executa uma vez para adicionar as contagens ao banco de dados
 */

import { getDatabase, closeDatabase } from './database/sqlite.js';

// Mapeamento de telefones para nomes (baseado na lista do usuário)
const phoneToName: Record<string, string> = {
    '5532988035131': 'Silverio',
    '5541985131604': 'ornieskipedro',
    '5541995520194': 'Kiko',
    '5541992461894': 'Gabriel',
    '5511950170666': 'dhaviaron',
    '5541996566128': 'Thiago Guimaraes',
    '5541987888769': 'Chico Gerlach',
    '5541995744554': 'Weslei Soares',
    '5541999844676': 'Jonatan Slompo',
    '5541995272045': 'Felpess',
    '5541996629627': 'Diego',
    '5541992927551': 'Luiz Lima',
    '5521996081009': 'Anna Lazaroni',
    '5519996689336': 'Maria Rodrigues',
    '5521970261788': 'Vt Pessanha',
    '5541998118161': 'Raphael Passos',
    '5541996244996': 'Ezio',
    '351910698784': 'Daniel Anspach',
    '5543991421241': 'Enzo DN',
    '5542999013703': 'Gustavo Marques',
    '351911125518': 'Bitten',
    '5521983990686': 'Carlao Crivello',
    '351930462897': 'Joaquim Hilling',
    '5541992066601': 'Filipe',
    '5541991388595': 'Cezar',
    '5542998145972': 'Holger K.',
    '5542991131357': 'Vitor',
    '5547991945997': 'Lara Rafaela',
    '5547991139263': 'Camila Imme',
    '351336785': 'Mateus Tashceck',
    '554798474841': 'Well Haskel',
    '351911797264': 'Antonio Carlos Villa',
    '351962151387': 'Gabriel Kiçula',
    '5541988284054': 'Trevisan',
    '5541995263014': 'Marcelo Xavier F',
    '5548984773079': 'Gabi Balza',
    '55479969391060': 'Andre Brito',
    '5541992396686': 'Diego Aragon',
    '5547997043640': 'Vinicius',
    '351925914169': 'Desconhecido PT',
    '5541988214116': 'Desconhecido BR1',
    '351916530277': 'Desconhecido PT2',
    '5541997382222': 'Desconhecido BR2',
    '5544984564748': 'Desconhecido BR3',
    '5541995400999': 'Desconhecido BR4',
    '5541995755445': 'Desconhecido BR5',
    '5541991910106': 'Desconhecido BR6',
    '5541995994400': 'Desconhecido BR7',
    '5541992584033': 'Desconhecido BR8',
    '5541999332616': 'Desconhecido BR9',
    '5541992757070': 'Desconhecido BR10',
    '5541997003338': 'Desconhecido BR11',
    '5541991168575': 'Desconhecido BR12',
    '5541987920709': 'Desconhecido BR13',
    '5548991068743': 'Desconhecido BR14',
    '5541995520194_2': 'Kiko',
    '5541984042973': 'Desconhecido BR15',
};

// Lista de cervejas para importar (3993-4072)
// Formato: [numero, visibleName, oderId baseado no telefone ou nome]
const beers: Array<{ number: number; name: string; oderId: string }> = [
    { number: 3993, name: 'Bernardo Aumann', oderId: 'gabardinho' },
    { number: 3994, name: 'Silverio', oderId: '5532988035131@s.whatsapp.net' },
    { number: 3995, name: 'ornieskipedro', oderId: '5541985131604@s.whatsapp.net' },
    { number: 3996, name: 'Kiko', oderId: '5541995520194@s.whatsapp.net' },
    { number: 3997, name: 'Gabriel', oderId: '5541992461894@s.whatsapp.net' },
    { number: 3998, name: 'dhaviaron', oderId: '5511950170666@s.whatsapp.net' },
    { number: 3999, name: 'Thiago Guimaraes', oderId: '5541996566128@s.whatsapp.net' },
    { number: 4000, name: 'Chico Gerlach', oderId: '5541987888769@s.whatsapp.net' },
    { number: 4001, name: 'Weslei Soares', oderId: '5541995744554@s.whatsapp.net' },
    { number: 4002, name: 'Jonatan Slompo', oderId: '5541999844676@s.whatsapp.net' },
    { number: 4003, name: 'Felpess', oderId: '5541995272045@s.whatsapp.net' },
    { number: 4004, name: 'Diego', oderId: '5541996629627@s.whatsapp.net' },
    { number: 4005, name: 'Luiz Lima', oderId: '5541992927551@s.whatsapp.net' },
    { number: 4006, name: 'Anna Lazaroni', oderId: '5521996081009@s.whatsapp.net' },
    { number: 4007, name: 'Maria Rodrigues', oderId: '5519996689336@s.whatsapp.net' },
    { number: 4008, name: 'Vt Pessanha', oderId: '5521970261788@s.whatsapp.net' },
    { number: 4009, name: 'Raphael Passos', oderId: '5541998118161@s.whatsapp.net' },
    { number: 4010, name: 'Ezio', oderId: '5541996244996@s.whatsapp.net' },
    { number: 4011, name: 'Daniel Anspach', oderId: '351910698784@s.whatsapp.net' },
    { number: 4012, name: 'Enzo DN', oderId: '5543991421241@s.whatsapp.net' },
    { number: 4013, name: 'Jonatan Slompo', oderId: '5541999844676@s.whatsapp.net' },
    { number: 4014, name: 'Gustavo Marques', oderId: '5542999013703@s.whatsapp.net' },
    { number: 4015, name: 'Bitten', oderId: '351911125518@s.whatsapp.net' },
    { number: 4016, name: 'Carlao Crivello', oderId: '5521983990686@s.whatsapp.net' },
    { number: 4017, name: 'Pedro Almeida', oderId: 'pedroalmeida@s.whatsapp.net' },
    { number: 4018, name: 'Joaquim Hilling', oderId: '351930462897@s.whatsapp.net' },
    { number: 4019, name: 'Filipe', oderId: '5541992066601@s.whatsapp.net' },
    { number: 4020, name: 'Cezar', oderId: '5541991388595@s.whatsapp.net' },
    { number: 4021, name: 'Holger K.', oderId: '5542998145972@s.whatsapp.net' },
    { number: 4022, name: 'Vitor', oderId: '5542991131357@s.whatsapp.net' },
    { number: 4023, name: 'Lara Rafaela', oderId: '5547991945997@s.whatsapp.net' },
    { number: 4024, name: 'Camila Imme', oderId: '5547991139263@s.whatsapp.net' },
    { number: 4025, name: 'Mateus Tashceck', oderId: '351336785@s.whatsapp.net' },
    { number: 4026, name: 'Well Haskel', oderId: '554798474841@s.whatsapp.net' },
    { number: 4027, name: 'Antonio Carlos Villa', oderId: '351911797264@s.whatsapp.net' },
    { number: 4028, name: 'Gabriel Kiçula', oderId: '351962151387@s.whatsapp.net' },
    { number: 4029, name: 'Trevisan', oderId: '5541988284054@s.whatsapp.net' },
    { number: 4030, name: 'Thiago Guimaraes', oderId: '5541996566128@s.whatsapp.net' },
    { number: 4031, name: 'Pedro Almeida', oderId: 'pedroalmeida@s.whatsapp.net' },
    { number: 4032, name: 'Bruno Tulio', oderId: 'brunotulio@s.whatsapp.net' },
    { number: 4033, name: 'Filipe', oderId: '5541992066601@s.whatsapp.net' },
    { number: 4034, name: 'Marcelo Xavier F', oderId: '5541995263014@s.whatsapp.net' },
    { number: 4035, name: 'Gabi Balza', oderId: '5548984773079@s.whatsapp.net' },
    { number: 4036, name: 'Andre Brito', oderId: '5547996939106@s.whatsapp.net' },
    { number: 4037, name: 'Felpess', oderId: '5541995272045@s.whatsapp.net' },
    { number: 4038, name: 'Diego Aragon', oderId: '5541992396686@s.whatsapp.net' },
    { number: 4039, name: 'Vinicius', oderId: '5547997043640@s.whatsapp.net' },
    { number: 4040, name: 'Tosin', oderId: 'tosin@s.whatsapp.net' },
    { number: 4041, name: 'Jacque Colaço', oderId: 'jacquecolaco@s.whatsapp.net' },
    { number: 4042, name: 'Desconhecido', oderId: '351925914169@s.whatsapp.net' },
    { number: 4043, name: 'Desconhecido', oderId: '5541988214116@s.whatsapp.net' },
    { number: 4044, name: 'Desconhecido', oderId: '351916530277@s.whatsapp.net' },
    { number: 4045, name: 'Desconhecido', oderId: '5541997382222@s.whatsapp.net' },
    { number: 4046, name: 'Desconhecido', oderId: '5544984564748@s.whatsapp.net' },
    { number: 4047, name: 'Pedro Almeida', oderId: 'pedroalmeida@s.whatsapp.net' },
    { number: 4048, name: 'Desconhecido', oderId: '5541995400999@s.whatsapp.net' },
    { number: 4049, name: 'Desconhecido', oderId: '351916530277@s.whatsapp.net' },
    { number: 4050, name: 'Daniel Anspach', oderId: '351910698784@s.whatsapp.net' },
    { number: 4051, name: 'Maria Rodrigues', oderId: '5519996689336@s.whatsapp.net' },
    { number: 4052, name: 'Bitten', oderId: '351911125518@s.whatsapp.net' },
    { number: 4053, name: 'Desconhecido', oderId: '5541995755445@s.whatsapp.net' },
    { number: 4054, name: 'Bitten', oderId: '351911125518@s.whatsapp.net' },
    { number: 4055, name: 'Anna Lazaroni', oderId: '5521996081009@s.whatsapp.net' },
    { number: 4056, name: 'Desconhecido', oderId: '5541991910106@s.whatsapp.net' },
    { number: 4057, name: 'Ezio', oderId: '5541996244996@s.whatsapp.net' },
    { number: 4058, name: 'Desconhecido', oderId: '5541995994400@s.whatsapp.net' },
    { number: 4059, name: 'Gabriel', oderId: '5541992461894@s.whatsapp.net' },
    { number: 4060, name: 'Jonatan Slompo', oderId: '5541999844676@s.whatsapp.net' },
    { number: 4061, name: 'Desconhecido', oderId: '5541992584033@s.whatsapp.net' },
    { number: 4062, name: 'Thiago Guimaraes', oderId: '5541996566128@s.whatsapp.net' },
    { number: 4063, name: 'Desconhecido', oderId: '5541999332616@s.whatsapp.net' },
    { number: 4064, name: 'Filipe', oderId: '5541992066601@s.whatsapp.net' },
    { number: 4065, name: 'Marcelo Xavier F', oderId: '5541995263014@s.whatsapp.net' },
    { number: 4066, name: 'Desconhecido', oderId: '5541992757070@s.whatsapp.net' },
    { number: 4067, name: 'Desconhecido', oderId: '5541997003338@s.whatsapp.net' },
    { number: 4068, name: 'Desconhecido', oderId: '5541991168575@s.whatsapp.net' },
    { number: 4069, name: 'Desconhecido', oderId: '5541987920709@s.whatsapp.net' },
    { number: 4070, name: 'Daniel Anspach', oderId: '351910698784@s.whatsapp.net' },
    { number: 4071, name: 'Kiko', oderId: '5541995520194@s.whatsapp.net' },
    { number: 4072, name: 'Desconhecido', oderId: '5541984042973@s.whatsapp.net' },
];

async function importBeers() {
    console.log('🍺 Iniciando importação de cervejas históricas...\n');

    const db = getDatabase();

    // Prepara statements
    const insertCount = db.prepare(`
    INSERT OR IGNORE INTO counts (number, user_id, user_name, message_id, has_image)
    VALUES (?, ?, ?, ?, 1)
  `);

    const upsertUser = db.prepare(`
    INSERT INTO users (id, name, total_count, last_count_at)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = COALESCE(excluded.name, name),
      total_count = total_count + 1,
      last_count_at = CURRENT_TIMESTAMP
  `);

    let imported = 0;
    let skipped = 0;

    for (const beer of beers) {
        try {
            const result = insertCount.run(
                beer.number,
                beer.oderId,
                beer.name,
                `import_${beer.number}`
            );

            if (result.changes > 0) {
                upsertUser.run(beer.oderId, beer.name);
                imported++;
                console.log(`✅ #${beer.number} - ${beer.name}`);
            } else {
                skipped++;
                console.log(`⏭️ #${beer.number} já existe, pulando...`);
            }
        } catch (error) {
            console.error(`❌ Erro ao importar #${beer.number}:`, error);
        }
    }

    console.log(`\n📊 Importação concluída!`);
    console.log(`   ✅ Importadas: ${imported}`);
    console.log(`   ⏭️ Puladas: ${skipped}`);

    // Mostra estatísticas
    const totalCount = db.prepare('SELECT MAX(number) as max FROM counts').get() as { max: number };
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };

    console.log(`\n📈 Status atual:`);
    console.log(`   🍺 Última contagem: ${totalCount.max}`);
    console.log(`   👥 Participantes: ${totalUsers.count}`);

    closeDatabase();
}

importBeers().catch(console.error);

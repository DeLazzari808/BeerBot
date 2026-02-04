/**
 * Comandos de Ban Massivo - banvagabundos, testban
 * Remove usuários com poucas cervejas do grupo
 */
import { proto } from '@whiskeysockets/baileys';
import { getSupabase } from '../../database/supabase.js';
import { getSocket, sendMessage, replyToMessage } from '../../services/whatsapp.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/env.js';

/**
 * Verifica se o usuário é admin
 */
function isAdmin(userId: string): boolean {
    const cleanId = userId.replace('@s.whatsapp.net', '').replace('@lid', '');
    return config.adminNumbers.some(admin => {
        const cleanAdmin = admin.replace('@s.whatsapp.net', '').replace('@lid', '');
        return cleanId === cleanAdmin || userId === admin;
    });
}

/**
 * Normaliza número para comparação
 */
function normalizarNumero(num: string): string {
    return num.replace(/[^0-9]/g, '');
}

/**
 * Busca usuários com menos de X cervejas do Supabase
 */
async function getUsuariosComPoucasCervejas(minCervejas: number): Promise<{ id: string; total_count: number }[]> {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('users')
        .select('id, total_count')
        .lt('total_count', minCervejas);

    if (error) {
        logger.error({ event: 'ban_massivo_query_error', error: error.message });
        throw error;
    }

    return data || [];
}

/**
 * Executa o ban massivo
 */
async function executarBanMassivo(
    groupId: string,
    minCervejas: number = 2
): Promise<{ removidos: number; erros: string[] }> {
    const sock = getSocket();
    if (!sock) {
        throw new Error('Socket não conectado');
    }

    logger.info({ event: 'ban_massivo_start', groupId, minCervejas });

    // 1. Busca usuários com poucas cervejas no banco
    const usuariosBanco = await getUsuariosComPoucasCervejas(minCervejas);
    logger.info({ event: 'ban_massivo_db_query', count: usuariosBanco.length });

    // 2. Pega metadados do grupo
    const groupMetadata = await sock.groupMetadata(groupId);
    const participantes = groupMetadata.participants;

    // 3. Filtra vagabundos (exceto admins do grupo e admins do bot)
    const vagabundos: string[] = [];
    const erros: string[] = [];

    for (const p of participantes) {
        // Pula se for admin do grupo
        if (p.admin) {
            logger.debug({ event: 'ban_massivo_skip_group_admin', id: p.id });
            continue;
        }

        // Pula se for admin do bot
        if (isAdmin(p.id)) {
            logger.debug({ event: 'ban_massivo_skip_bot_admin', id: p.id });
            continue;
        }

        const numero = normalizarNumero(p.id.split('@')[0]);

        // Verifica se o número está na lista de vagabundos do banco
        const encontrado = usuariosBanco.some(u => {
            return normalizarNumero(u.id) === numero;
        });

        if (encontrado) {
            vagabundos.push(p.id);
        }
    }

    logger.info({ event: 'ban_massivo_filtered', totalVagabundos: vagabundos.length });

    // 4. Remove em massa
    if (vagabundos.length > 0) {
        try {
            await sock.groupParticipantsUpdate(
                groupId,
                vagabundos,
                'remove'
            );

            logger.info({
                event: 'ban_massivo_success',
                removidos: vagabundos.length,
                minCervejas
            });

        } catch (removeError) {
            logger.error({
                event: 'ban_massivo_remove_error',
                error: removeError instanceof Error ? removeError.message : String(removeError)
            });
            erros.push('Erro ao remover alguns participantes');
        }
    }

    return { removidos: vagabundos.length, erros };
}

/**
 * Gera preview dos vagabundos sem remover
 */
async function gerarPreviewBan(
    groupId: string,
    minCervejas: number = 2
): Promise<{ numero: string; cervejas: number; nome?: string }[]> {
    const sock = getSocket();
    if (!sock) {
        throw new Error('Socket não conectado');
    }

    // 1. Busca usuários com poucas cervejas
    const usuariosBanco = await getUsuariosComPoucasCervejas(minCervejas);

    // 2. Pega metadados do grupo
    const groupMetadata = await sock.groupMetadata(groupId);
    const participantes = groupMetadata.participants;

    // 3. Filtra vagabundos
    const preview: { numero: string; cervejas: number; nome?: string }[] = [];

    for (const p of participantes) {
        // Pula admins do grupo
        if (p.admin) continue;

        // Pula admins do bot
        if (isAdmin(p.id)) continue;

        const numero = normalizarNumero(p.id.split('@')[0]);

        const usuario = usuariosBanco.find(u => normalizarNumero(u.id) === numero);

        if (usuario) {
            preview.push({
                numero,
                cervejas: usuario.total_count,
            });
        }
    }

    return preview;
}

/**
 * Handler do comando /banvagabundos
 */
export async function handleBanVagabundos(
    jid: string,
    args: string[],
    senderId: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    // Verifica se é admin
    if (!isAdmin(senderId)) {
        logger.warn({ event: 'ban_massivo_denied', senderId });
        await replyToMessage(jid, '❌ Apenas admins podem usar este comando.', message);
        return;
    }

    // Parse threshold (default = 2)
    const threshold = args[0] ? parseInt(args[0], 10) : 2;
    if (isNaN(threshold) || threshold < 1 || threshold > 1000) {
        await replyToMessage(jid, '❌ Uso: /banvagabundos [número]\\nEx: /banvagabundos 5 (remove quem tem < 5 cervejas)', message);
        return;
    }

    await replyToMessage(jid, `🔄 Iniciando limpeza... Removendo quem tem menos de ${threshold} cervejas.`, message);

    try {
        const { removidos, erros } = await executarBanMassivo(jid, threshold);

        if (removidos === 0) {
            await sendMessage(jid, '✅ Nenhum vagabundo encontrado. Todos estão contribuindo! 🍺');
        } else {
            let resposta = `🍺 *LIMPEZA REALIZADA!*\n\n` +
                `🚮 *${removidos}* vagabundos removidos.\n` +
                `📊 Mínimo exigido: *${threshold}* cervejas\n\n` +
                `💪 Contribua ou caia fora!`;

            if (erros.length > 0) {
                resposta += `\n\n⚠️ Avisos:\n${erros.join('\n')}`;
            }

            await sendMessage(jid, resposta);
        }

        logger.info({ event: 'ban_massivo_complete', removidos, threshold, executadoPor: senderId });

    } catch (error) {
        logger.error({
            event: 'ban_massivo_error',
            error: error instanceof Error ? error.message : String(error),
            senderId
        });
        await sendMessage(jid, '❌ Erro ao realizar limpeza. Verifique os logs do servidor.');
    }
}

/**
 * Handler do comando /testban (preview sem remover)
 */
export async function handleTestBan(
    jid: string,
    args: string[],
    senderId: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    // Verifica se é admin
    if (!isAdmin(senderId)) {
        logger.warn({ event: 'testban_denied', senderId });
        await replyToMessage(jid, '❌ Apenas admins podem usar este comando.', message);
        return;
    }

    // Parse threshold (default = 2)
    const threshold = args[0] ? parseInt(args[0], 10) : 2;
    if (isNaN(threshold) || threshold < 1 || threshold > 1000) {
        await replyToMessage(jid, '❌ Uso: /testban [número]\\nEx: /testban 5', message);
        return;
    }

    await replyToMessage(jid, '🔍 Analisando grupo...', message);

    try {
        const preview = await gerarPreviewBan(jid, threshold);

        if (preview.length === 0) {
            await sendMessage(jid, '✅ Nenhum vagabundo encontrado! Todos têm pelo menos ' + threshold + ' cervejas. 🍺');
            return;
        }

        // Monta preview (limita a 50 para não ficar muito grande)
        const listaExibir = preview.slice(0, 50);
        let texto = `🔍 *PREVIEW - Seriam removidos:*\n\n`;

        listaExibir.forEach((v, i) => {
            texto += `${i + 1}. ${v.numero} — ${v.cervejas} 🍺\n`;
        });

        if (preview.length > 50) {
            texto += `\n... e mais ${preview.length - 50} usuários`;
        }

        texto += `\n\n📊 *Total: ${preview.length} usuários*`;
        texto += `\n⚙️ Mínimo: ${threshold} cervejas`;
        texto += `\n\n⚠️ Use */banvagabundos ${threshold}* para remover.`;

        await sendMessage(jid, texto);

        logger.info({ event: 'testban_complete', count: preview.length, threshold, executadoPor: senderId });

    } catch (error) {
        logger.error({
            event: 'testban_error',
            error: error instanceof Error ? error.message : String(error),
            senderId
        });
        await sendMessage(jid, '❌ Erro ao analisar grupo. Verifique os logs.');
    }
}

/**
 * Comandos administrativos - setcount, fix, del, setuser, recalc, recap, audit
 */

import { proto } from '@whiskeysockets/baileys';
import { counterService } from '../../core/counter.js';
import { countRepository } from '../../database/repositories/count.repo.js';
import { userRepository } from '../../database/repositories/user.repo.js';
import { sendMessage, replyToMessage } from '../../services/whatsapp.js';
import { logger } from '../../utils/logger.js';
import { MAX_COUNT_VALUE, MIN_COUNT_VALUE } from '../../config/constants.js';
import { requireAdmin, validateCountNumber, formatNumber } from './utils.js';

export async function handleSetCount(
    jid: string,
    args: string[],
    senderId: string,
    senderName: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    if (!await requireAdmin(jid, senderId, message, 'setcount')) return;

    const validation = validateCountNumber(args[0], MIN_COUNT_VALUE, MAX_COUNT_VALUE);
    if (!validation.valid) {
        await replyToMessage(jid, `❌ Uso: /setcount <número>\n${validation.errorMessage}\nEx: /setcount 3872`, message);
        return;
    }

    const current = await counterService.getCurrentCount();
    if (current > 0) {
        await replyToMessage(
            jid,
            `❌ Já existe uma contagem em andamento (${current}). Use /fix para corrigir.`,
            message
        );
        return;
    }

    const success = await counterService.setInitialCount(validation.number!, senderId, senderName);
    if (success) {
        await sendMessage(jid, `✅ Contagem iniciada em *${validation.number}*! O próximo é *${validation.number! + 1}*. 🍺`);
    } else {
        await replyToMessage(jid, '❌ Erro ao definir contagem inicial.', message);
    }
}

export async function handleForceCount(
    jid: string,
    args: string[],
    senderId: string,
    senderName: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    if (!await requireAdmin(jid, senderId, message, 'fix')) return;

    const validation = validateCountNumber(args[0], 1, MAX_COUNT_VALUE);
    if (!validation.valid) {
        await replyToMessage(jid, `❌ Uso: /fix <número>\n${validation.errorMessage}\nEx: /fix 3875`, message);
        return;
    }

    const success = await counterService.forceCount(validation.number!, senderId, senderName);
    if (success) {
        await sendMessage(jid, `✅ Contagem forçada para *${validation.number}*! O próximo é *${validation.number! + 1}*. 🍺`);
    } else {
        await replyToMessage(jid, '❌ Erro ao forçar contagem.', message);
    }
}

export async function handleDeleteCount(
    jid: string,
    args: string[],
    senderId: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    if (!await requireAdmin(jid, senderId, message, 'del')) return;

    const validation = validateCountNumber(args[0], 1);
    if (!validation.valid) {
        await replyToMessage(jid, '❌ Uso: /del <número>\nEx: /del 3950', message);
        return;
    }

    const deleted = await countRepository.deleteByNumber(validation.number!);
    if (deleted) {
        await sendMessage(
            jid,
            `✅ Cerveja *#${validation.number}* deletada!\n` +
            `👤 Era de: ${deleted.userName || 'Anônimo'}\n` +
            `📊 Ranking atualizado automaticamente.`
        );
    } else {
        await replyToMessage(jid, `❌ Cerveja #${validation.number} não encontrada.`, message);
    }
}

export async function handleSetUser(
    jid: string,
    args: string[],
    senderId: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    if (!await requireAdmin(jid, senderId, message, 'setuser')) return;

    if (args.length < 2) {
        await replyToMessage(jid, '❌ Uso: /setuser <ID ou Nome> <total>\nEx: /setuser Felpess 100', message);
        return;
    }

    const total = parseInt(args[args.length - 1], 10);
    if (isNaN(total) || total < 0 || total > MAX_COUNT_VALUE) {
        await replyToMessage(jid, `❌ O total deve ser um número válido entre 0 e ${formatNumber(MAX_COUNT_VALUE)}`, message);
        return;
    }

    const identifier = args.slice(0, -1).join(' ');

    // Tenta encontrar por ID primeiro, depois por nome
    let user = await userRepository.getStats(identifier);
    if (!user) {
        user = await userRepository.findByName(identifier);
    }

    if (!user) {
        await replyToMessage(jid, `❌ Usuário "${identifier}" não encontrado.`, message);
        return;
    }

    logger.info({
        event: 'admin_setuser',
        userId: user.id,
        oldTotal: user.totalCount,
        newTotal: total,
        executedBy: senderId
    });

    const success = await userRepository.setUserTotal(user.id, total);
    if (success) {
        await sendMessage(
            jid,
            `✅ Total atualizado!\n` +
            `👤 Usuário: *${user.name || user.id}*\n` +
            `🍺 Novo total: *${total}* cervejas`
        );
    } else {
        await replyToMessage(jid, '❌ Erro ao atualizar total do usuário.', message);
    }
}

export async function handleRecalc(
    jid: string,
    senderId: string,
    message: proto.IWebMessageInfo
): Promise<void> {
    if (!await requireAdmin(jid, senderId, message, 'recalc')) return;

    await replyToMessage(jid, '🔄 Recalculando estatísticas... aguarde.', message);

    try {
        const count = await userRepository.recalculateAll();
        await sendMessage(jid, `✅ Sincronização concluída!\n\n👥 ${count} usuários atualizados com base no histórico de cervejas.`);
        logger.info({ event: 'recalc_complete', usersUpdated: count, executedBy: senderId });
    } catch (error) {
        logger.error({ event: 'recalc_error', error: error instanceof Error ? error.message : String(error), executedBy: senderId });
        await replyToMessage(jid, `❌ Erro ao recalcular estatísticas: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, message);
    }
}

export async function handleAudit(jid: string): Promise<void> {
    const last = await countRepository.getLastN(15);

    if (last.length === 0) {
        await sendMessage(jid, '📋 Nenhuma contagem registrada ainda!');
        return;
    }

    const lines = last.map(c =>
        `${c.number}. ${c.userName || 'Anônimo'} ${c.hasImage ? '📸' : ''}`
    );

    const text =
        `📋 *ÚLTIMAS 15 CONTAGENS* 📋\n\n` +
        lines.join('\n');

    await sendMessage(jid, text);
}

export async function handleRecap(): Promise<void> {
    const { sendDailyRecap } = await import('../../services/scheduler.js');
    await sendDailyRecap();
}

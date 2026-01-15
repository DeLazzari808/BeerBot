import { countRepository } from '../database/repositories/count.repo.js';
import { sendMessage } from '../services/whatsapp.js';
import { logger } from '../utils/logger.js';

/**
 * Handler para quando uma mensagem é deletada
 */
export async function handleDelete(messageId: string, jid: string): Promise<void> {
    // Tenta encontrar e deletar a contagem associada
    const deleted = await countRepository.deleteByMessageId(messageId);

    if (deleted) {
        logger.info({
            event: 'count_reverted',
            number: deleted.number,
            userId: deleted.userId,
            userName: deleted.userName,
        });

        await sendMessage(
            jid,
            `🗑️ Mensagem apagada! Contagem *#${deleted.number}* de ${deleted.userName || 'Anônimo'} foi revertida.`
        );
    }
}

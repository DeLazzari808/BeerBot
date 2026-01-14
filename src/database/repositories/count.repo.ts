import { getDatabase } from '../sqlite.js';

export interface CountRecord {
    id: number;
    number: number;
    userId: string;
    userName: string | null;
    messageId: string | null;
    hasImage: boolean;
    createdAt: string;
}

export interface CountInput {
    number: number;
    userId: string;
    userName?: string;
    messageId?: string;
    hasImage?: boolean;
}

export const countRepository = {
    /**
     * Adiciona uma nova contagem
     */
    add(input: CountInput): CountRecord | null {
        const db = getDatabase();

        try {
            const stmt = db.prepare(`
        INSERT INTO counts (number, user_id, user_name, message_id, has_image)
        VALUES (?, ?, ?, ?, ?)
      `);

            const result = stmt.run(
                input.number,
                input.userId,
                input.userName || null,
                input.messageId || null,
                input.hasImage ? 1 : 0
            );

            // Atualiza contador do usuário
            db.prepare(`
        INSERT INTO users (id, name, total_count, last_count_at)
        VALUES (?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = COALESCE(excluded.name, name),
          total_count = total_count + 1,
          last_count_at = CURRENT_TIMESTAMP
      `).run(input.userId, input.userName || null);

            return this.getById(result.lastInsertRowid as number);
        } catch (error) {
            // Provavelmente número duplicado
            return null;
        }
    },

    /**
     * Busca contagem pelo ID
     */
    getById(id: number): CountRecord | null {
        const db = getDatabase();
        const row = db.prepare('SELECT * FROM counts WHERE id = ?').get(id) as any;
        return row ? this.mapRow(row) : null;
    },

    /**
     * Retorna a última contagem
     */
    getLastCount(): number {
        const db = getDatabase();
        const row = db.prepare(
            'SELECT number FROM counts ORDER BY number DESC LIMIT 1'
        ).get() as { number: number } | undefined;

        return row?.number || 0;
    },

    /**
     * Retorna as últimas N contagens para auditoria
     */
    getLastN(n: number = 20): CountRecord[] {
        const db = getDatabase();
        const rows = db.prepare(`
      SELECT * FROM counts ORDER BY number DESC LIMIT ?
    `).all(n) as any[];

        return rows.map(this.mapRow);
    },

    /**
     * Verifica se número já existe
     */
    exists(number: number): boolean {
        const db = getDatabase();
        const row = db.prepare('SELECT 1 FROM counts WHERE number = ?').get(number);
        return !!row;
    },

    /**
     * Retorna estatísticas do dia
     */
    getDailyStats(date: string): {
        total: number;
        startNumber: number;
        endNumber: number;
        topContributors: { userId: string; userName: string; count: number }[];
    } {
        const db = getDatabase();

        // Total do dia
        const totalRow = db.prepare(`
      SELECT COUNT(*) as total 
      FROM counts 
      WHERE DATE(created_at) = ?
    `).get(date) as { total: number };

        // Primeiro e último número do dia
        const rangeRow = db.prepare(`
      SELECT MIN(number) as startNumber, MAX(number) as endNumber
      FROM counts 
      WHERE DATE(created_at) = ?
    `).get(date) as { startNumber: number; endNumber: number } | undefined;

        // Top contribuidores do dia
        const topRows = db.prepare(`
      SELECT user_id, user_name, COUNT(*) as count
      FROM counts 
      WHERE DATE(created_at) = ?
      GROUP BY user_id
      ORDER BY count DESC
      LIMIT 5
    `).all(date) as any[];

        return {
            total: totalRow?.total || 0,
            startNumber: rangeRow?.startNumber || 0,
            endNumber: rangeRow?.endNumber || 0,
            topContributors: topRows.map(r => ({
                userId: r.user_id,
                userName: r.user_name || 'Anônimo',
                count: r.count,
            })),
        };
    },

    /**
     * Define contagem inicial (para /setcount)
     */
    setInitialCount(number: number, userId: string, userName?: string): boolean {
        const db = getDatabase();

        // Só permite se não houver contagens
        const existing = this.getLastCount();
        if (existing > 0) {
            return false;
        }

        try {
            db.prepare(`
        INSERT INTO counts (number, user_id, user_name, message_id, has_image)
        VALUES (?, ?, ?, 'initial', 0)
      `).run(number, userId, userName || 'Sistema');

            return true;
        } catch {
            return false;
        }
    },

    /**
     * Força uma contagem específica (admin only)
     */
    forceCount(number: number, userId: string, userName?: string): boolean {
        const db = getDatabase();

        try {
            // Deleta números futuros e o atual para garantir consistência
            db.prepare('DELETE FROM counts WHERE number >= ?').run(number);

            db.prepare(`
        INSERT INTO counts (number, user_id, user_name, message_id, has_image)
        VALUES (?, ?, ?, 'forced', 0)
      `).run(number, userId, userName || 'Admin');

            return true;
        } catch {
            return false;
        }
    },

    /**
     * Deleta contagem por message_id (quando usuário apaga a mensagem)
     */
    deleteByMessageId(messageId: string): CountRecord | null {
        const db = getDatabase();

        // Busca o registro antes de deletar
        const record = db.prepare(
            'SELECT * FROM counts WHERE message_id = ?'
        ).get(messageId) as any;

        if (!record) return null;

        // Deleta o registro
        db.prepare('DELETE FROM counts WHERE message_id = ?').run(messageId);

        // Atualiza contador do usuário
        db.prepare(`
      UPDATE users SET total_count = total_count - 1
      WHERE id = ? AND total_count > 0
    `).run(record.user_id);

        return this.mapRow(record);
    },

    mapRow(row: any): CountRecord {
        return {
            id: row.id,
            number: row.number,
            userId: row.user_id,
            userName: row.user_name,
            messageId: row.message_id,
            hasImage: !!row.has_image,
            createdAt: row.created_at,
        };
    },
};

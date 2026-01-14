import { getDatabase } from '../sqlite.js';

export interface UserStats {
    id: string;
    name: string | null;
    totalCount: number;
    lastCountAt: string | null;
}

export const userRepository = {
    /**
     * Retorna estatísticas de um usuário
     */
    getStats(userId: string): UserStats | null {
        const db = getDatabase();
        const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
        return row ? this.mapRow(row) : null;
    },

    /**
     * Retorna ranking dos top N usuários
     */
    getTopN(n: number = 10): UserStats[] {
        const db = getDatabase();
        const rows = db.prepare(`
      SELECT * FROM users 
      ORDER BY total_count DESC 
      LIMIT ?
    `).all(n) as any[];

        return rows.map(this.mapRow);
    },

    /**
     * Retorna posição do usuário no ranking
     */
    getRank(userId: string): number {
        const db = getDatabase();
        const row = db.prepare(`
      SELECT COUNT(*) + 1 as rank
      FROM users
      WHERE total_count > (SELECT total_count FROM users WHERE id = ?)
    `).get(userId) as { rank: number } | undefined;

        return row?.rank || 0;
    },

    /**
     * Retorna total de usuários participantes
     */
    getTotalParticipants(): number {
        const db = getDatabase();
        const row = db.prepare('SELECT COUNT(*) as total FROM users').get() as { total: number };
        return row.total;
    },

    mapRow(row: any): UserStats {
        return {
            id: row.id,
            name: row.name,
            totalCount: row.total_count,
            lastCountAt: row.last_count_at,
        };
    },
};

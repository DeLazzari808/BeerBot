import { getSupabase } from '../supabase.js';

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
    async getStats(userId: string): Promise<UserStats | null> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error || !data) return null;
        return this.mapRow(data);
    },

    /**
     * Retorna ranking dos top N usuários
     */
    async getTopN(n: number = 10): Promise<UserStats[]> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('total_count', { ascending: false })
            .limit(n);

        if (error || !data) return [];
        return data.map(this.mapRow);
    },

    /**
     * Retorna posição do usuário no ranking
     */
    async getRank(userId: string): Promise<number> {
        const supabase = getSupabase();

        // Primeiro pega o total do usuário
        const { data: userRow } = await supabase
            .from('users')
            .select('total_count')
            .eq('id', userId)
            .single();

        if (!userRow) return 0;

        // Conta quantos têm mais cervejas
        const { count } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gt('total_count', userRow.total_count);

        return (count || 0) + 1;
    },

    /**
     * Retorna total de usuários participantes
     */
    async getTotalParticipants(): Promise<number> {
        const supabase = getSupabase();
        const { count } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });

        return count || 0;
    },

    /**
     * Busca usuário por nome (parcial, case insensitive)
     */
    async findByName(name: string): Promise<UserStats | null> {
        const supabase = getSupabase();
        const { data } = await supabase
            .from('users')
            .select('*')
            .ilike('name', `%${name}%`)
            .limit(1)
            .single();

        if (!data) return null;
        return this.mapRow(data);
    },

    /**
     * Força o total de cervejas de um usuário (admin)
     */
    async setUserTotal(userId: string, total: number): Promise<boolean> {
        const supabase = getSupabase();
        const { error } = await supabase
            .from('users')
            .update({ total_count: total })
            .eq('id', userId);

        return !error;
    },

    /**
     * Recalcula estatísticas de todos os usuários
     * Chama a função SQL recalculate_all_users()
     */
    async recalculateAll(): Promise<number> {
        const supabase = getSupabase();

        // Executa recálculo via SQL direto
        // Como não temos a função ainda, fazemos manualmente
        const { data: counts } = await supabase
            .from('counts')
            .select('user_id, user_name, created_at');

        if (!counts || counts.length === 0) return 0;

        // Agrupa por usuário
        const userMap = new Map<string, { name: string; count: number; lastAt: string }>();
        for (const row of counts) {
            const existing = userMap.get(row.user_id);
            if (existing) {
                existing.count++;
                if (row.created_at > existing.lastAt) {
                    existing.lastAt = row.created_at;
                    if (row.user_name) existing.name = row.user_name;
                }
            } else {
                userMap.set(row.user_id, {
                    name: row.user_name || 'Anônimo',
                    count: 1,
                    lastAt: row.created_at,
                });
            }
        }

        // Limpa tabela users
        await supabase.from('users').delete().neq('id', '');

        // Reinsere
        const usersToInsert = Array.from(userMap.entries()).map(([id, data]) => ({
            id,
            name: data.name,
            total_count: data.count,
            last_count_at: data.lastAt,
        }));

        if (usersToInsert.length > 0) {
            await supabase.from('users').insert(usersToInsert);
        }

        return usersToInsert.length;
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

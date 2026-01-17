import { getSupabase } from '../supabase.js';
import { logger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';

export interface UserStats {
    id: string;
    name: string | null;
    totalCount: number;
    lastCountAt: string | null;
}

// Interface para row do Supabase
interface UserRow {
    id: string;
    name: string | null;
    total_count: number;
    last_count_at: string | null;
}

/**
 * Escapa caracteres especiais de LIKE/ILIKE para evitar injection
 */
function escapeLikePattern(input: string): string {
    return input.replace(/[%_\\]/g, '\\$&');
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

        if (error) {
            if (error.code !== 'PGRST116') { // Not found is ok
                logger.error({ event: 'user_get_stats_error', userId, error: error.message });
            }
            return null;
        }
        if (!data) return null;
        return this.mapRow(data as UserRow);
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

        if (error) {
            logger.error({ event: 'user_get_top_error', n, error: error.message });
            return [];
        }
        if (!data) return [];
        return data.map((row) => this.mapRow(row as UserRow));
    },

    /**
     * Retorna posição do usuário no ranking
     */
    async getRank(userId: string): Promise<number> {
        const supabase = getSupabase();

        // Primeiro pega o total do usuário
        const { data: userRow, error: userError } = await supabase
            .from('users')
            .select('total_count')
            .eq('id', userId)
            .single();

        if (userError || !userRow) {
            if (userError && userError.code !== 'PGRST116') {
                logger.error({ event: 'user_get_rank_error', userId, error: userError.message });
            }
            return 0;
        }

        // Conta quantos têm mais cervejas
        const { count, error: countError } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .gt('total_count', userRow.total_count);

        if (countError) {
            logger.error({ event: 'user_rank_count_error', userId, error: countError.message });
            return 0;
        }

        return (count || 0) + 1;
    },

    /**
     * Retorna total de usuários participantes
     */
    async getTotalParticipants(): Promise<number> {
        const supabase = getSupabase();
        const { count, error } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });

        if (error) {
            logger.error({ event: 'user_total_participants_error', error: error.message });
            return 0;
        }

        return count || 0;
    },

    /**
     * Busca usuário por nome (parcial, case insensitive)
     * Input é sanitizado para evitar LIKE injection
     */
    async findByName(name: string): Promise<UserStats | null> {
        const supabase = getSupabase();
        const escapedName = escapeLikePattern(name);

        const { data, error } = await supabase
            .from('users')
            .select('*')
            .ilike('name', `%${escapedName}%`)
            .limit(1)
            .single();

        if (error) {
            if (error.code !== 'PGRST116') {
                logger.error({ event: 'user_find_by_name_error', name, error: error.message });
            }
            return null;
        }
        if (!data) return null;
        return this.mapRow(data as UserRow);
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

        if (error) {
            logger.error({ event: 'user_set_total_error', userId, total, error: error.message });
            return false;
        }

        logger.info({ event: 'user_total_set', userId, total });
        return true;
    },

    /**
     * Incrementa contagem do usuário (ou cria se não existir)
     * Retorna o novo total ou null se falhou
     * Usa RPC function para incremento atômico no banco de dados
     */
    async incrementUserCount(userId: string, userName: string): Promise<number | null> {
        const supabase = getSupabase();

        // Usa RPC function para incremento atômico
        const { data, error } = await supabase.rpc('increment_user_count', {
            p_user_id: userId,
            p_user_name: userName || 'Anônimo',
        });

        if (error) {
            logger.error({ event: 'user_increment_rpc_error', userId, error: error.message });
            return null;
        }

        // A RPC retorna diretamente o novo total
        return data as number;
    },

    /**
     * Decrementa contagem do usuário
     * Retorna true se operação foi bem-sucedida
     */
    async decrementUserCount(userId: string): Promise<boolean> {
        const supabase = getSupabase();

        const { data: user, error: selectError } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (selectError) {
            if (selectError.code !== 'PGRST116') {
                logger.error({ event: 'user_decrement_select_error', userId, error: selectError.message });
            }
            return false;
        }

        const userRow = user as UserRow;
        if (userRow && userRow.total_count > 0) {
            const { error: updateError } = await supabase
                .from('users')
                .update({
                    total_count: userRow.total_count - 1
                })
                .eq('id', userId);

            if (updateError) {
                logger.error({ event: 'user_decrement_update_error', userId, error: updateError.message });
                return false;
            }
        }

        return true;
    },

    /**
     * Recalcula estatísticas de todos os usuários usando UPSERT
     * Evita DELETE+INSERT que poderia causar perda de dados
     */
    async recalculateAll(): Promise<number> {
        const supabase = getSupabase();

        logger.info({ event: 'recalculate_all_start' });

        // Busca todas as contagens
        const { data: counts, error: fetchError } = await supabase
            .from('counts')
            .select('user_id, user_name, created_at');

        if (fetchError) {
            logger.error({ event: 'recalculate_all_fetch_error', error: fetchError.message });
            throw new Error(`Erro ao buscar contagens: ${fetchError.message}`);
        }

        if (!counts || counts.length === 0) {
            logger.info({ event: 'recalculate_all_no_counts' });
            return 0;
        }

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

        // Usa UPSERT para atualizar/inserir usuários de forma atômica
        const usersToUpsert = Array.from(userMap.entries()).map(([id, data]) => ({
            id,
            name: data.name,
            total_count: data.count,
            last_count_at: data.lastAt,
        }));

        if (usersToUpsert.length > 0) {
            // Processa em batches de 100 para evitar timeout
            const batchSize = 100;
            for (let i = 0; i < usersToUpsert.length; i += batchSize) {
                const batch = usersToUpsert.slice(i, i + batchSize);

                const { error: upsertError } = await supabase
                    .from('users')
                    .upsert(batch, {
                        onConflict: 'id',
                        ignoreDuplicates: false
                    });

                if (upsertError) {
                    logger.error({
                        event: 'recalculate_all_upsert_error',
                        batch: i / batchSize + 1,
                        error: upsertError.message
                    });
                    throw new Error(`Erro ao atualizar usuários: ${upsertError.message}`);
                }
            }
        }

        // Remove usuários que não têm mais contagens (limpeza)
        const validUserIds = Array.from(userMap.keys());
        if (validUserIds.length > 0) {
            const { error: cleanupError } = await supabase
                .from('users')
                .delete()
                .not('id', 'in', `(${validUserIds.map(id => `'${id}'`).join(',')})`);

            if (cleanupError) {
                logger.warn({ event: 'recalculate_all_cleanup_warning', error: cleanupError.message });
                // Não falha a operação se cleanup falhar
            }
        }

        logger.info({ event: 'recalculate_all_complete', usersUpdated: usersToUpsert.length });
        return usersToUpsert.length;
    },

    /**
     * Busca múltiplos usuários por IDs (batch)
     */
    async getStatsBatch(userIds: string[]): Promise<Map<string, UserStats>> {
        const supabase = getSupabase();
        const result = new Map<string, UserStats>();

        if (userIds.length === 0) return result;

        const { data, error } = await supabase
            .from('users')
            .select('*')
            .in('id', userIds);

        if (error) {
            logger.error({ event: 'user_get_stats_batch_error', error: error.message });
            return result;
        }

        if (data) {
            for (const row of data) {
                const stats = this.mapRow(row as UserRow);
                result.set(stats.id, stats);
            }
        }

        return result;
    },

    mapRow(row: UserRow): UserStats {
        return {
            id: row.id,
            name: row.name,
            totalCount: row.total_count,
            lastCountAt: row.last_count_at,
        };
    },
};

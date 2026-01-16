import { getSupabase } from '../supabase.js';
import { userRepository } from './user.repo.js';
import { logger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';

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

// Interface para row do Supabase
interface CountRow {
    id: number;
    number: number;
    user_id: string;
    user_name: string | null;
    message_id: string | null;
    has_image: boolean;
    created_at: string;
}

export const countRepository = {
    /**
     * Adiciona uma nova contagem
     * Atualiza tabela users manualmente (sem trigger)
     */
    async add(input: CountInput): Promise<CountRecord | null> {
        const supabase = getSupabase();

        const { data, error } = await supabase
            .from('counts')
            .insert({
                number: input.number,
                user_id: input.userId,
                user_name: input.userName || null,
                message_id: input.messageId || null,
                has_image: input.hasImage || false,
            })
            .select()
            .single();

        if (error) {
            // Provavelmente número duplicado
            logger.warn({ event: 'count_add_error', number: input.number, error: error.message });
            return null;
        }

        // Atualiza ranking
        const userUpdated = await userRepository.incrementUserCount(input.userId, input.userName || 'Anônimo');
        if (!userUpdated) {
            logger.warn({ event: 'count_add_user_update_failed', userId: input.userId });
        }

        logger.info({ event: 'count_added', number: input.number, userId: input.userId });
        return this.mapRow(data as CountRow);
    },

    /**
     * Busca contagem pelo ID
     */
    async getById(id: number): Promise<CountRecord | null> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('counts')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code !== 'PGRST116') {
                logger.error({ event: 'count_get_by_id_error', id, error: error.message });
            }
            return null;
        }
        if (!data) return null;
        return this.mapRow(data as CountRow);
    },

    /**
     * Retorna a última contagem (maior número)
     * Usa retry para resiliência contra falhas transientes
     */
    async getLastCount(): Promise<number> {
        return withRetry(async () => {
            const supabase = getSupabase();
            const { data, error } = await supabase
                .from('counts')
                .select('number')
                .order('number', { ascending: false })
                .limit(1)
                .single();

            if (error) {
                if (error.code !== 'PGRST116') {
                    logger.error({ event: 'count_get_last_error', error: error.message });
                    throw error; // Propaga erro para retry
                }
                return 0;
            }
            if (!data) return 0;
            return data.number;
        }, { maxRetries: 3, baseDelayMs: 200 });
    },

    /**
     * Retorna as últimas N contagens para auditoria
     */
    async getLastN(n: number = 20): Promise<CountRecord[]> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('counts')
            .select('*')
            .order('number', { ascending: false })
            .limit(n);

        if (error) {
            logger.error({ event: 'count_get_last_n_error', n, error: error.message });
            return [];
        }
        if (!data) return [];
        return data.map((row) => this.mapRow(row as CountRow));
    },

    /**
     * Verifica se número já existe
     */
    async exists(number: number): Promise<boolean> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('counts')
            .select('id')
            .eq('number', number)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error({ event: 'count_exists_error', number, error: error.message });
        }

        return !!data;
    },

    /**
     * Retorna estatísticas do dia
     */
    async getDailyStats(date: string): Promise<{
        total: number;
        startNumber: number;
        endNumber: number;
        topContributors: { userId: string; userName: string; count: number }[];
    }> {
        const supabase = getSupabase();
        const startOfDay = `${date}T00:00:00`;
        const endOfDay = `${date}T23:59:59`;

        // Total do dia
        const { count: total, error: totalError } = await supabase
            .from('counts')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startOfDay)
            .lte('created_at', endOfDay);

        if (totalError) {
            logger.error({ event: 'count_daily_stats_total_error', date, error: totalError.message });
        }

        // Range de números
        const { data: rangeData, error: rangeError } = await supabase
            .from('counts')
            .select('number')
            .gte('created_at', startOfDay)
            .lte('created_at', endOfDay)
            .order('number', { ascending: true });

        if (rangeError) {
            logger.error({ event: 'count_daily_stats_range_error', date, error: rangeError.message });
        }

        const numbers = rangeData?.map((r: { number: number }) => r.number) || [];
        const startNumber = numbers[0] || 0;
        const endNumber = numbers[numbers.length - 1] || 0;

        // Top contributors - precisamos agrupar manualmente
        const { data: allDayCounts, error: contributorsError } = await supabase
            .from('counts')
            .select('user_id, user_name')
            .gte('created_at', startOfDay)
            .lte('created_at', endOfDay);

        if (contributorsError) {
            logger.error({ event: 'count_daily_stats_contributors_error', date, error: contributorsError.message });
        }

        const contributorMap = new Map<string, { userName: string; count: number }>();
        for (const row of allDayCounts || []) {
            const existing = contributorMap.get(row.user_id);
            if (existing) {
                existing.count++;
            } else {
                contributorMap.set(row.user_id, {
                    userName: row.user_name || 'Anônimo',
                    count: 1,
                });
            }
        }

        const topContributors = Array.from(contributorMap.entries())
            .map(([userId, data]) => ({ userId, ...data }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return {
            total: total || 0,
            startNumber,
            endNumber,
            topContributors,
        };
    },

    /**
     * Retorna estatísticas da semana (últimos 7 dias)
     */
    async getWeeklyStats(): Promise<{
        total: number;
        startNumber: number;
        endNumber: number;
        dailyAverage: number;
        topContributors: { userId: string; userName: string; count: number }[];
        dailyBreakdown: { date: string; count: number }[];
    }> {
        const supabase = getSupabase();

        // Calcula datas da semana
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 6); // Últimos 7 dias incluindo hoje

        const startOfWeek = weekAgo.toISOString().split('T')[0] + 'T00:00:00';
        const endOfWeek = today.toISOString().split('T')[0] + 'T23:59:59';

        logger.debug({ event: 'weekly_stats_fetch', startOfWeek, endOfWeek });

        // Busca todas as contagens da semana em uma única query
        const { data: weekCounts, error: fetchError } = await supabase
            .from('counts')
            .select('number, user_id, user_name, created_at')
            .gte('created_at', startOfWeek)
            .lte('created_at', endOfWeek)
            .order('created_at', { ascending: true });

        if (fetchError) {
            logger.error({ event: 'count_weekly_stats_error', error: fetchError.message });
            return {
                total: 0,
                startNumber: 0,
                endNumber: 0,
                dailyAverage: 0,
                topContributors: [],
                dailyBreakdown: [],
            };
        }

        if (!weekCounts || weekCounts.length === 0) {
            return {
                total: 0,
                startNumber: 0,
                endNumber: 0,
                dailyAverage: 0,
                topContributors: [],
                dailyBreakdown: [],
            };
        }

        // Calcular estatísticas a partir dos dados
        const total = weekCounts.length;
        const numbers = weekCounts.map(r => r.number);
        const startNumber = Math.min(...numbers);
        const endNumber = Math.max(...numbers);

        // Agrupa por usuário
        const contributorMap = new Map<string, { userName: string; count: number }>();
        const dailyMap = new Map<string, number>();

        for (const row of weekCounts) {
            // Contributors
            const existing = contributorMap.get(row.user_id);
            if (existing) {
                existing.count++;
            } else {
                contributorMap.set(row.user_id, {
                    userName: row.user_name || 'Anônimo',
                    count: 1,
                });
            }

            // Daily breakdown
            const dayKey = row.created_at.split('T')[0];
            dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + 1);
        }

        const topContributors = Array.from(contributorMap.entries())
            .map(([userId, data]) => ({ userId, ...data }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const dailyBreakdown = Array.from(dailyMap.entries())
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const dailyAverage = Math.round(total / 7);

        return {
            total,
            startNumber,
            endNumber,
            dailyAverage,
            topContributors,
            dailyBreakdown,
        };
    },

    /**
     * Define contagem inicial (para /setcount)
     */
    async setInitialCount(number: number, userId: string, userName?: string): Promise<boolean> {
        // Só permite se não houver contagens
        const existing = await this.getLastCount();
        if (existing > 0) {
            logger.warn({ event: 'count_set_initial_rejected', number, reason: 'already_has_counts' });
            return false;
        }

        const supabase = getSupabase();
        const { error } = await supabase
            .from('counts')
            .insert({
                number,
                user_id: userId,
                user_name: userName || 'Sistema',
                message_id: 'initial',
                has_image: false,
            });

        if (error) {
            logger.error({ event: 'count_set_initial_error', number, error: error.message });
            return false;
        }

        const userUpdated = await userRepository.incrementUserCount(userId, userName || 'Sistema');
        if (!userUpdated) {
            logger.warn({ event: 'count_set_initial_user_update_failed', userId });
        }

        logger.info({ event: 'count_initial_set', number, userId });
        return true;
    },

    /**
     * Força uma contagem específica (admin only)
     * Deleta números >= number e insere o novo
     */
    async forceCount(number: number, userId: string, userName?: string): Promise<boolean> {
        const supabase = getSupabase();

        logger.info({ event: 'count_force_start', number, userId });

        // Deleta números futuros
        const { error: deleteError } = await supabase
            .from('counts')
            .delete()
            .gte('number', number);

        if (deleteError) {
            logger.error({ event: 'count_force_delete_error', number, error: deleteError.message });
            return false;
        }

        // Insere novo
        const { error: insertError } = await supabase
            .from('counts')
            .insert({
                number,
                user_id: userId,
                user_name: userName || 'Admin',
                message_id: 'forced',
                has_image: false,
            });

        if (insertError) {
            logger.error({ event: 'count_force_insert_error', number, error: insertError.message });
            return false;
        }

        // Recalcula tudo para garantir consistência
        try {
            await userRepository.recalculateAll();
        } catch (e) {
            logger.error({ event: 'count_force_recalculate_error', error: e instanceof Error ? e.message : String(e) });
        }

        logger.info({ event: 'count_forced', number, userId });
        return true;
    },

    /**
     * Deleta contagem por message_id (quando usuário apaga a mensagem)
     * Atualiza ranking manualmente
     */
    async deleteByMessageId(messageId: string): Promise<CountRecord | null> {
        const supabase = getSupabase();

        // Busca o registro antes de deletar
        const { data: record, error: selectError } = await supabase
            .from('counts')
            .select('*')
            .eq('message_id', messageId)
            .single();

        if (selectError) {
            if (selectError.code !== 'PGRST116') {
                logger.error({ event: 'count_delete_by_message_select_error', messageId, error: selectError.message });
            }
            return null;
        }

        if (!record) return null;

        // Deleta o registro
        const { error: deleteError } = await supabase
            .from('counts')
            .delete()
            .eq('message_id', messageId);

        if (deleteError) {
            logger.error({ event: 'count_delete_by_message_error', messageId, error: deleteError.message });
            return null;
        }

        // Atualiza ranking
        const userUpdated = await userRepository.decrementUserCount(record.user_id);
        if (!userUpdated) {
            logger.warn({ event: 'count_delete_user_update_failed', userId: record.user_id });
        }

        logger.info({ event: 'count_deleted_by_message', messageId, number: record.number });
        return this.mapRow(record as CountRow);
    },

    /**
     * Deleta contagem por número (comando /del)
     * Atualiza ranking manualmente
     */
    async deleteByNumber(number: number): Promise<CountRecord | null> {
        const supabase = getSupabase();

        // Busca o registro antes de deletar
        const { data: record, error: selectError } = await supabase
            .from('counts')
            .select('*')
            .eq('number', number)
            .single();

        if (selectError) {
            if (selectError.code !== 'PGRST116') {
                logger.error({ event: 'count_delete_by_number_select_error', number, error: selectError.message });
            }
            return null;
        }

        if (!record) return null;

        // Deleta o registro
        const { error: deleteError } = await supabase
            .from('counts')
            .delete()
            .eq('number', number);

        if (deleteError) {
            logger.error({ event: 'count_delete_by_number_error', number, error: deleteError.message });
            return null;
        }

        // Atualiza ranking
        const userUpdated = await userRepository.decrementUserCount(record.user_id);
        if (!userUpdated) {
            logger.warn({ event: 'count_delete_user_update_failed', userId: record.user_id });
        }

        logger.info({ event: 'count_deleted_by_number', number, userId: record.user_id });
        return this.mapRow(record as CountRow);
    },

    mapRow(row: CountRow): CountRecord {
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

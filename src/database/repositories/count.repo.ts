import { getSupabase } from '../supabase.js';

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
     * O trigger do Supabase atualiza a tabela users automaticamente
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
            console.error('[count.repo] Insert error:', error.message);
            return null;
        }

        return this.mapRow(data);
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

        if (error || !data) return null;
        return this.mapRow(data);
    },

    /**
     * Retorna a última contagem (maior número)
     */
    async getLastCount(): Promise<number> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('counts')
            .select('number')
            .order('number', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) return 0;
        return data.number;
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

        if (error || !data) return [];
        return data.map(this.mapRow);
    },

    /**
     * Verifica se número já existe
     */
    async exists(number: number): Promise<boolean> {
        const supabase = getSupabase();
        const { data } = await supabase
            .from('counts')
            .select('id')
            .eq('number', number)
            .single();

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
        const { count: total } = await supabase
            .from('counts')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startOfDay)
            .lte('created_at', endOfDay);

        // Range de números
        const { data: rangeData } = await supabase
            .from('counts')
            .select('number')
            .gte('created_at', startOfDay)
            .lte('created_at', endOfDay)
            .order('number', { ascending: true });

        const numbers = rangeData?.map(r => r.number) || [];
        const startNumber = numbers[0] || 0;
        const endNumber = numbers[numbers.length - 1] || 0;

        // Top contributors - precisamos agrupar manualmente
        const { data: allDayCounts } = await supabase
            .from('counts')
            .select('user_id, user_name')
            .gte('created_at', startOfDay)
            .lte('created_at', endOfDay);

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
     * Define contagem inicial (para /setcount)
     */
    async setInitialCount(number: number, userId: string, userName?: string): Promise<boolean> {
        // Só permite se não houver contagens
        const existing = await this.getLastCount();
        if (existing > 0) {
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

        return !error;
    },

    /**
     * Força uma contagem específica (admin only)
     * Deleta números >= number e insere o novo
     */
    async forceCount(number: number, userId: string, userName?: string): Promise<boolean> {
        const supabase = getSupabase();

        // Deleta números futuros
        await supabase
            .from('counts')
            .delete()
            .gte('number', number);

        // Insere novo
        const { error } = await supabase
            .from('counts')
            .insert({
                number,
                user_id: userId,
                user_name: userName || 'Admin',
                message_id: 'forced',
                has_image: false,
            });

        return !error;
    },

    /**
     * Deleta contagem por message_id (quando usuário apaga a mensagem)
     * O trigger ajusta o ranking automaticamente
     */
    async deleteByMessageId(messageId: string): Promise<CountRecord | null> {
        const supabase = getSupabase();

        // Busca o registro antes de deletar
        const { data: record } = await supabase
            .from('counts')
            .select('*')
            .eq('message_id', messageId)
            .single();

        if (!record) return null;

        // Deleta o registro - trigger ajusta users
        await supabase
            .from('counts')
            .delete()
            .eq('message_id', messageId);

        return this.mapRow(record);
    },

    /**
     * Deleta contagem por número (comando /del)
     * O trigger ajusta o ranking automaticamente
     */
    async deleteByNumber(number: number): Promise<CountRecord | null> {
        const supabase = getSupabase();

        // Busca o registro antes de deletar
        const { data: record } = await supabase
            .from('counts')
            .select('*')
            .eq('number', number)
            .single();

        if (!record) return null;

        // Deleta o registro - trigger ajusta users
        await supabase
            .from('counts')
            .delete()
            .eq('number', number);

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

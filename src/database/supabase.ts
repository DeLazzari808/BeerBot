import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

let supabaseClient: SupabaseClient | null = null;

/**
 * Retorna o cliente Supabase (lazy initialization)
 * Throws error se credenciais não configuradas
 */
export function getSupabase(): SupabaseClient {
    if (!supabaseClient) {
        if (!config.supabase.url || !config.supabase.key) {
            throw new Error('Supabase não configurado! Configure SUPABASE_URL e SUPABASE_KEY no .env');
        }

        supabaseClient = createClient(config.supabase.url, config.supabase.key);
        logger.info('Supabase client inicializado');
    }
    return supabaseClient;
}

/**
 * Verifica se Supabase está disponível
 */
export function isSupabaseConfigured(): boolean {
    return !!(config.supabase.url && config.supabase.key);
}

/**
 * Testa conexão com Supabase
 */
export async function testSupabaseConnection(): Promise<boolean> {
    try {
        const supabase = getSupabase();
        const { error } = await supabase.from('counts').select('id').limit(1);
        if (error) {
            logger.error({ error }, 'Erro ao conectar ao Supabase');
            return false;
        }
        return true;
    } catch (e) {
        logger.error({ error: e }, 'Supabase não disponível');
        return false;
    }
}

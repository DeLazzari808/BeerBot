import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { SUPABASE_TIMEOUT_MS } from '../config/constants.js';

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

        supabaseClient = createClient(config.supabase.url, config.supabase.key, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
            global: {
                fetch: (url, options = {}) => {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

                    return fetch(url, {
                        ...options,
                        signal: controller.signal,
                    }).finally(() => clearTimeout(timeoutId));
                },
            },
        });
        logger.info('Supabase client inicializado com timeout de ' + SUPABASE_TIMEOUT_MS + 'ms');
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
            logger.error({ event: 'supabase_connection_error', error: error.message });
            return false;
        }
        return true;
    } catch (e) {
        logger.error({ event: 'supabase_unavailable', error: e instanceof Error ? e.message : String(e) });
        return false;
    }
}

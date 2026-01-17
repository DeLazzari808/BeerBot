/**
 * Constantes globais do Beer Counter Bot
 */

// Meta de cervejas
export const GOAL = 1_000_000;

// Rate limiting
export const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos
export const COOLDOWN_CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos

// Horários
export const STATS_UNLOCK_HOUR = 18; // Hora que libera comandos de estatísticas
export const DAILY_RECAP_HOUR = 23;
export const DAILY_RECAP_MINUTE = 45;

// Milestones para celebração
export const MILESTONE_HUNDRED = 100;
export const MILESTONE_THOUSAND = 1000;
export const MILESTONE_TEN_THOUSAND = 10000;
export const MILESTONE_FIFTY_THOUSAND = 50000;
export const MILESTONE_HUNDRED_THOUSAND = 100000;

// Timeouts (em ms)
export const SUPABASE_TIMEOUT_MS = 10000; // 10 segundos
export const WHATSAPP_RECONNECT_BASE_DELAY_MS = 1000;
export const WHATSAPP_RECONNECT_MAX_DELAY_MS = 30000;

// Limites
export const MAX_COUNT_VALUE = GOAL; // Não permite setcount/fix acima da meta
export const MIN_COUNT_VALUE = 0;

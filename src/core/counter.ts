import { countRepository } from '../database/repositories/count.repo.js';
import { validateSequence, ValidationResult } from './validator.js';
import { logger } from '../utils/logger.js';
import { GOAL, COUNT_CACHE_TTL_MS } from '../config/constants.js';

export interface CountAttempt {
    number: number;
    userId: string;
    userName?: string;
    messageId?: string;
    hasImage?: boolean;
}

export interface CountResponse {
    success: boolean;
    validation: ValidationResult;
    currentCount: number;
    userTotal?: number; // Total de cervejas do usuário após esta contagem
}

// Cache simples para getCurrentCount
let cachedCount: number | null = null;
let cacheTimestamp: number = 0;

/**
 * Serviço central de contagem de cervejas
 */
export const counterService = {
    /**
     * Retorna a contagem atual (com cache)
     */
    async getCurrentCount(): Promise<number> {
        const now = Date.now();

        // Retorna cache se ainda válido
        if (cachedCount !== null && (now - cacheTimestamp) < COUNT_CACHE_TTL_MS) {
            return cachedCount;
        }

        // Busca do banco e atualiza cache
        cachedCount = await countRepository.getLastCount();
        cacheTimestamp = now;

        return cachedCount;
    },

    /**
     * Invalida o cache (chamado após alterações)
     */
    invalidateCache(): void {
        cachedCount = null;
        cacheTimestamp = 0;
    },

    /**
     * Tenta adicionar uma nova contagem
     */
    async attemptCount(attempt: CountAttempt): Promise<CountResponse> {
        const currentCount = await this.getCurrentCount();
        const validation = validateSequence(attempt.number, currentCount);

        if (validation.status !== 'VALID') {
            return {
                success: false,
                validation,
                currentCount,
            };
        }

        // Tenta inserir no banco
        const result = await countRepository.add({
            number: attempt.number,
            userId: attempt.userId,
            userName: attempt.userName,
            messageId: attempt.messageId,
            hasImage: attempt.hasImage,
        });

        if (!result) {
            // Provavelmente alguém foi mais rápido - invalida cache
            this.invalidateCache();
            const newCurrentCount = await this.getCurrentCount();
            return {
                success: false,
                validation: {
                    status: 'DUPLICATE',
                    expectedNumber: newCurrentCount + 1,
                    receivedNumber: attempt.number,
                    message: `⚠️ Opa! Alguém foi mais rápido. Já estamos em ${newCurrentCount}!`,
                },
                currentCount: newCurrentCount,
            };
        }

        // Invalida cache após sucesso
        this.invalidateCache();

        logger.info({
            event: 'count_added',
            number: attempt.number,
            userId: attempt.userId,
            userName: attempt.userName,
            userTotal: result.userTotal,
        });

        return {
            success: true,
            validation,
            currentCount: attempt.number,
            userTotal: result.userTotal,
        };
    },

    /**
     * Define contagem inicial
     */
    async setInitialCount(number: number, userId: string, userName?: string): Promise<boolean> {
        const success = await countRepository.setInitialCount(number, userId, userName);
        if (success) {
            this.invalidateCache();
            logger.info({ event: 'initial_count_set', number, userId });
        }
        return success;
    },

    /**
     * Força uma contagem (admin)
     */
    async forceCount(number: number, userId: string, userName?: string): Promise<boolean> {
        const success = await countRepository.forceCount(number, userId, userName);
        if (success) {
            this.invalidateCache();
        }
        return success;
    },

    /**
     * Retorna progresso em direção à meta
     */
    async getProgress(): Promise<{ current: number; goal: number; percentage: number }> {
        const current = await this.getCurrentCount();
        const percentage = Math.round((current / GOAL) * 10000) / 100;

        return { current, goal: GOAL, percentage };
    },
};

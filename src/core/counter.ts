import { countRepository } from '../database/repositories/count.repo.js';
import { validateSequence, ValidationResult } from './validator.js';
import { logger } from '../utils/logger.js';

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
}

/**
 * Serviço central de contagem de cervejas
 */
export const counterService = {
    /**
     * Retorna a contagem atual
     */
    async getCurrentCount(): Promise<number> {
        return countRepository.getLastCount();
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
        const record = await countRepository.add({
            number: attempt.number,
            userId: attempt.userId,
            userName: attempt.userName,
            messageId: attempt.messageId,
            hasImage: attempt.hasImage,
        });

        if (!record) {
            // Provavelmente alguém foi mais rápido
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

        logger.info({
            event: 'count_added',
            number: attempt.number,
            userId: attempt.userId,
            userName: attempt.userName,
        });

        return {
            success: true,
            validation,
            currentCount: attempt.number,
        };
    },

    /**
     * Define contagem inicial
     */
    async setInitialCount(number: number, userId: string, userName?: string): Promise<boolean> {
        const success = await countRepository.setInitialCount(number, userId, userName);
        if (success) {
            logger.info({ event: 'initial_count_set', number, userId });
        }
        return success;
    },

    /**
     * Força uma contagem (admin)
     */
    async forceCount(number: number, userId: string, userName?: string): Promise<boolean> {
        return countRepository.forceCount(number, userId, userName);
    },

    /**
     * Retorna progresso em direção à meta
     */
    async getProgress(): Promise<{ current: number; goal: number; percentage: number }> {
        const current = await this.getCurrentCount();
        const goal = 1_000_000;
        const percentage = Math.round((current / goal) * 10000) / 100;

        return { current, goal, percentage };
    },
};

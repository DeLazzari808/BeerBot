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
    getCurrentCount(): number {
        return countRepository.getLastCount();
    },

    /**
     * Tenta adicionar uma nova contagem
     */
    attemptCount(attempt: CountAttempt): CountResponse {
        const currentCount = this.getCurrentCount();
        const validation = validateSequence(attempt.number, currentCount);

        if (validation.status !== 'VALID') {
            return {
                success: false,
                validation,
                currentCount,
            };
        }

        // Tenta inserir no banco
        const record = countRepository.add({
            number: attempt.number,
            userId: attempt.userId,
            userName: attempt.userName,
            messageId: attempt.messageId,
            hasImage: attempt.hasImage,
        });

        if (!record) {
            // Provavelmente alguém foi mais rápido
            const newCurrentCount = this.getCurrentCount();
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
    setInitialCount(number: number, userId: string, userName?: string): boolean {
        const success = countRepository.setInitialCount(number, userId, userName);
        if (success) {
            logger.info({ event: 'initial_count_set', number, userId });
        }
        return success;
    },

    /**
     * Força uma contagem (admin)
     */
    forceCount(number: number, userId: string, userName?: string): boolean {
        return countRepository.forceCount(number, userId, userName);
    },

    /**
     * Retorna progresso em direção à meta
     */
    getProgress(): { current: number; goal: number; percentage: number } {
        const current = this.getCurrentCount();
        const goal = 1_000_000;
        const percentage = Math.round((current / goal) * 10000) / 100;

        return { current, goal, percentage };
    },
};

import { countRepository } from '../database/repositories/count.repo.js';
import { ValidationResult } from './validator.js';
import { logger } from '../utils/logger.js';
import { GOAL } from '../config/constants.js';

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

/**
 * Serviço central de contagem de cervejas
 */
export const counterService = {
    /**
     * Retorna a contagem atual (sempre do banco)
     */
    async getCurrentCount(): Promise<number> {
        return countRepository.getLastCount();
    },

    /**
     * Tenta adicionar uma nova contagem
     * A RPC atômica valida sequência + insere + atualiza usuário em uma única transação
     */
    async attemptCount(attempt: CountAttempt): Promise<CountResponse> {
        // A RPC atômica faz validação + inserção + atualização de usuário
        // em uma única transação com lock para evitar race conditions
        const result = await countRepository.add({
            number: attempt.number,
            userId: attempt.userId,
            userName: attempt.userName,
            messageId: attempt.messageId,
            hasImage: attempt.hasImage,
        });

        if (!result) {
            // RPC falhou (sequência inválida, duplicado, ou erro)
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
            userTotal: result.userTotal,
        });

        return {
            success: true,
            validation: {
                status: 'VALID',
                expectedNumber: attempt.number,
                receivedNumber: attempt.number,
                message: '',
            },
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
        const percentage = Math.round((current / GOAL) * 10000) / 100;

        return { current, goal: GOAL, percentage };
    },
};

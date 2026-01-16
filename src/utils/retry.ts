import { logger } from './logger.js';

export interface RetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (error: unknown, attempt: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxRetries: 3,
    baseDelayMs: 100,
    maxDelayMs: 5000,
    onRetry: () => {},
};

/**
 * Executa uma função com retry exponencial
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: unknown;

    for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt === opts.maxRetries) {
                break;
            }

            // Exponential backoff com jitter
            const delay = Math.min(
                opts.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100,
                opts.maxDelayMs
            );

            logger.warn({
                event: 'retry_attempt',
                attempt,
                maxRetries: opts.maxRetries,
                delayMs: delay,
                error: error instanceof Error ? error.message : String(error),
            });

            opts.onRetry(error, attempt);
            await sleep(delay);
        }
    }

    throw lastError;
}

/**
 * Executa uma função com timeout
 */
export async function withTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    errorMessage = 'Operation timed out'
): Promise<T> {
    return Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
        ),
    ]);
}

/**
 * Combina retry e timeout
 */
export async function withRetryAndTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    retryOptions: RetryOptions = {}
): Promise<T> {
    return withRetry(
        () => withTimeout(fn, timeoutMs),
        retryOptions
    );
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

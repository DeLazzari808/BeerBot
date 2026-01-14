export type ValidationStatus =
    | 'VALID'       // Número é o próximo da sequência
    | 'DUPLICATE'   // Número já foi contado
    | 'SKIPPED'     // Pulou números na sequência
    | 'BEHIND'      // Número é menor que o esperado
    | 'INVALID';    // Número inválido

export interface ValidationResult {
    status: ValidationStatus;
    expectedNumber: number;
    receivedNumber: number;
    message: string;
}

/**
 * Valida se o número recebido é válido na sequência.
 */
export function validateSequence(
    receivedNumber: number,
    currentCount: number
): ValidationResult {
    const expectedNumber = currentCount + 1;

    if (receivedNumber === expectedNumber) {
        return {
            status: 'VALID',
            expectedNumber,
            receivedNumber,
            message: `✅ ${receivedNumber}`,
        };
    }

    if (receivedNumber === currentCount) {
        return {
            status: 'DUPLICATE',
            expectedNumber,
            receivedNumber,
            message: `⚠️ ${receivedNumber} já foi contado! O próximo é ${expectedNumber}`,
        };
    }

    if (receivedNumber < currentCount) {
        return {
            status: 'BEHIND',
            expectedNumber,
            receivedNumber,
            message: `⏪ ${receivedNumber}? Já estamos em ${currentCount}! Próximo: ${expectedNumber}`,
        };
    }

    if (receivedNumber > expectedNumber) {
        const skipped = receivedNumber - expectedNumber;
        return {
            status: 'SKIPPED',
            expectedNumber,
            receivedNumber,
            message: `⏩ Calma aê! Pulou ${skipped} número${skipped > 1 ? 's' : ''}. Esperado: ${expectedNumber}`,
        };
    }

    return {
        status: 'INVALID',
        expectedNumber,
        receivedNumber,
        message: `❌ Número inválido`,
    };
}

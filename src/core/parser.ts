export interface ParseResult {
    success: boolean;
    number: number | null;
    raw: string;
}

/**
 * Extrai o número de contagem de uma mensagem.
 * Aceita formatos como: "42", "#42", "42 🍺", "breja 42", etc.
 */
export function parseCountFromMessage(message: string): ParseResult {
    const trimmed = message.trim();

    // Remove hashtag se presente
    const cleaned = trimmed.replace(/^#/, '');

    // Padrões aceitos:
    // 1. Apenas número: "123"
    // 2. Número no início: "123 alguma coisa"
    // 3. Número no final: "cerveja 123"

    // Tenta extrair número do início
    const startMatch = cleaned.match(/^(\d+)/);
    if (startMatch) {
        const num = parseInt(startMatch[1], 10);
        if (num > 0 && num <= 1_000_000) {
            return { success: true, number: num, raw: trimmed };
        }
    }

    // Tenta extrair número do final
    const endMatch = cleaned.match(/(\d+)$/);
    if (endMatch) {
        const num = parseInt(endMatch[1], 10);
        if (num > 0 && num <= 1_000_000) {
            return { success: true, number: num, raw: trimmed };
        }
    }

    // Número muito grande ou inválido
    return { success: false, number: null, raw: trimmed };
}

/**
 * Extrai comando se a mensagem começar com /
 */
export function parseCommand(message: string): { command: string; args: string[] } | null {
    const trimmed = message.trim();

    if (!trimmed.startsWith('/')) {
        return null;
    }

    const parts = trimmed.slice(1).split(/\s+/);
    const command = parts[0]?.toLowerCase() || '';
    const args = parts.slice(1);

    return { command, args };
}

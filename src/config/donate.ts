/**
 * Configuração do sistema de doação (PIX)
 */

// Configuração da chave PIX
export const DONATE_CONFIG = {
    pixKey: process.env.PIX_KEY || 'boratomaumalanobar@gmail.com',
    enabled: true,
    hintProbability: 0.20, // 20% de chance de mostrar hint
};

/**
 * Mensagens para o comando /donate ou /pix
 * Tom: apoiar o desenvolvimento, não mendigando
 */
export const DONATE_MESSAGES = [
    `💚 *APOIE O DESENVOLVIMENTO* 💚\n\n` +
    `Curtiu o bot? Toda contribuição ajuda a manter e melhorar o projeto!\n\n` +
    `📲 *Chave PIX:*\n\`${DONATE_CONFIG.pixKey}\`\n\n` +
    `_Valeu pelo apoio!_ 🍺`,

    `🛠️ *MELHORIAS NO BOT* 🛠️\n\n` +
    `Quer ajudar a manter o bot funcionando e recebendo atualizações?\n\n` +
    `📲 *Chave PIX:*\n\`${DONATE_CONFIG.pixKey}\`\n\n` +
    `_Obrigado!_ 🍻`,

    `⭐ *APOIE O PROJETO* ⭐\n\n` +
    `Sua contribuição ajuda a manter o bot no ar e trazer novas funcionalidades!\n\n` +
    `📲 *Chave PIX:*\n\`${DONATE_CONFIG.pixKey}\`\n\n` +
    `_Valeu demais!_ 🤙`,
];

/**
 * Hints curtos para aparecer no final dos comandos
 * Tom: sutil, 20% de chance
 */
export const DONATE_HINTS = [
    '💚 _Apoie o desenvolvimento: /pix_',
    '⭐ _Ajude a manter o bot: /pix_',
    '🛠️ _Contribua: /donate_',
];

/**
 * Retorna um hint aleatório para adicionar no final das mensagens
 * Retorna string vazia se não deve mostrar (baseado na probabilidade)
 */
export function maybeGetDonateHint(): string {
    if (!DONATE_CONFIG.enabled) return '';
    if (Math.random() > DONATE_CONFIG.hintProbability) return '';

    const hint = DONATE_HINTS[Math.floor(Math.random() * DONATE_HINTS.length)];
    return `\n\n${hint}`;
}

/**
 * Retorna uma mensagem completa para o comando /donate
 */
export function getDonateMessage(): string {
    return DONATE_MESSAGES[Math.floor(Math.random() * DONATE_MESSAGES.length)];
}

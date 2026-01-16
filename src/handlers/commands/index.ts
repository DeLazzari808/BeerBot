/**
 * Router de comandos - versão modular
 * 
 * Este módulo coordena a execução dos comandos, delegando para módulos específicos.
 * Mantém retrocompatibilidade re-exportando handleCommand do handler original.
 */

export { handleCommand } from '../command.handler.js';

// Re-exporta módulos para uso direto se necessário
export * from './utils.js';
export * from './public.js';
export * from './admin.js';

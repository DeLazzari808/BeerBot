# Plano de Correções e Melhorias - Beer Counter Bot

## Resumo
Corrigir 22 bugs identificados (1 crítico, 6 altos) e implementar melhorias de todas as prioridades.

---

## Fase 1: Bugs Críticos e Altos (Prioridade Máxima)

### 1.1 Transação Atômica no `recalculateAll` [CRÍTICO]
**Arquivo:** `src/database/repositories/user.repo.ts:168-213`
**Problema:** DELETE + INSERT sem transação - pode perder dados se falhar no meio
**Solução:** Usar UPSERT em vez de DELETE+INSERT

### 1.2 Retry Logic para Operações de Banco [ALTO]
**Arquivos:** `src/database/repositories/*.ts`
**Problema:** Sem retry em falhas transientes
**Solução:** Criar wrapper `withRetry()` em `src/utils/retry.ts`

### 1.3 Timeout nas Chamadas de API [ALTO]
**Arquivo:** `src/database/supabase.ts`
**Problema:** Chamadas podem ficar penduradas indefinidamente
**Solução:** Configurar timeout global no cliente Supabase

### 1.4 Sanitização de Input no `findByName` [ALTO]
**Arquivo:** `src/database/repositories/user.repo.ts:80-91`
**Problema:** Caracteres especiais de LIKE não escapados
**Solução:** Escapar `%` e `_` antes de usar no pattern

### 1.5 Verificação de Erros em Updates [ALTO]
**Arquivos:** `src/database/repositories/user.repo.ts:121-139`
**Problema:** Updates não verificam resultado de sucesso
**Solução:** Verificar `error` e retornar status em todas operações

### 1.6 Validação de Entrada em Comandos Admin [ALTO]
**Arquivo:** `src/handlers/command.handler.ts:340-388`
**Problema:** `/setcount` e `/fix` aceitam qualquer valor
**Solução:** Adicionar limite máximo (1.000.000) e validação

### 1.7 Divisão por Zero em `/meu` [MÉDIO→ALTO]
**Arquivo:** `src/handlers/command.handler.ts:257`
**Problema:** `progress.current` pode ser 0
**Solução:** Verificar antes de dividir

---

## Fase 2: Correções de Robustez

### 2.1 Reconexão WhatsApp com Backoff [MÉDIO]
**Arquivo:** `src/services/whatsapp.ts:63-66`
**Solução:** Adicionar delay exponencial entre reconexões

### 2.2 Scheduler com Flag Anti-Duplicata [MÉDIO]
**Arquivo:** `src/services/scheduler.ts:22-24`
**Problema:** Pode disparar recap múltiplas vezes no mesmo minuto
**Solução:** Adicionar `lastRecapDate` para evitar duplicatas

### 2.3 Limpeza Periódica do Map de Cooldowns [MÉDIO]
**Arquivo:** `src/handlers/command.handler.ts:12`
**Problema:** Memory leak - Map nunca é limpo
**Solução:** Adicionar cleanup periódico (a cada 30min)

### 2.4 Graceful Shutdown Completo [BAIXO]
**Arquivo:** `src/index.ts:49-56`
**Solução:** Aguardar operações pendentes antes de exit

---

## Fase 3: Qualidade de Código

### 3.1 Padronizar Logging [MÉDIA]
**Arquivos:** Múltiplos
**Ação:** Substituir todos `console.log/error` por `logger`
- `message.handler.ts:69-70`
- `whatsapp.ts:74,81`
- `command.handler.ts:194`
- `count.repo.ts:44`

### 3.2 Tipar Rows do Supabase [ALTA]
**Arquivos:** `count.repo.ts`, `user.repo.ts`
**Ação:** Criar interfaces para rows do Supabase, remover `any`

### 3.3 Remover Código Morto [BAIXA]
- Deletar `src/database/sqlite.ts`
- Mover scripts one-time para `scripts/` (opcional)
- Usar `parseCommand` de `parser.ts` ou remover

### 3.4 Extrair Constantes [BAIXA]
**Arquivo:** `src/config/constants.ts` (novo)
- `GOAL = 1_000_000`
- `COOLDOWN_MS = 5 * 60 * 1000`
- `STATS_UNLOCK_HOUR = 18`
- `MILESTONES = [100, 1000]`

---

## Fase 4: Melhorias de Performance

### 4.1 Cache para `getCurrentCount` [ALTA]
**Arquivo:** `src/core/counter.ts`
**Solução:** Cache em memória com TTL de 1-2 segundos

### 4.2 Otimizar `getDailyStats` [MÉDIA]
**Arquivo:** `src/database/repositories/count.repo.ts:117-177`
**Solução:** Usar RPC do Supabase ou SQL agregado

### 4.3 Paralelizar Queries em `handleMyStats` [MÉDIA]
**Arquivo:** `src/handlers/command.handler.ts:242-276`
**Solução:** `Promise.all` para queries independentes

### 4.4 Batch Query no Recap [MÉDIA]
**Arquivo:** `src/services/scheduler.ts:214`
**Problema:** N+1 query para stats de contributors
**Solução:** Buscar stats em batch

---

## Fase 5: Melhorias de UX

### 5.1 Feedback Consistente [ALTA]
**Arquivo:** `src/handlers/message.handler.ts`
- Informar erro se auto-count falhar
- Adicionar reação visual no auto-count (não só no número certo)

### 5.2 Comando Desconhecido [MÉDIA]
**Arquivo:** `src/handlers/command.handler.ts:172-175`
**Solução:** Responder "comando não reconhecido" em vez de ignorar

### 5.3 `/help` Completo [MÉDIA]
**Arquivo:** `src/handlers/command.handler.ts:313-326`
**Ação:** Adicionar `/elo`, `/s`, aliases, e explicar sistema de elos

### 5.4 Novos Comandos [MÉDIA]
- `/hoje` - stats do dia atual
- `/semana` - recap da semana (opcional)

### 5.5 Milestones Especiais [BAIXA]
**Arquivo:** `src/handlers/message.handler.ts:206-228`
**Ação:** Celebrações diferenciadas para 10k, 50k, 100k

---

## Fase 6: Observabilidade

### 6.1 Logs em Operações Críticas [ALTA]
**Arquivos:** Repositórios e handlers
**Ação:** Adicionar logs estruturados com:
- Operação realizada
- Usuário que executou
- Resultado (sucesso/erro)

### 6.2 Auditoria de Comandos Admin [ALTA]
**Arquivo:** `src/handlers/command.handler.ts`
**Ação:** Log detalhado para `/fix`, `/del`, `/setuser`, `/setcount`

### 6.3 Health Check (Opcional) [MÉDIA]
**Arquivo:** `src/services/health.ts` (novo)
**Ação:** Endpoint HTTP simples para monitoramento

---

## Fase 7: Refatoração de Arquitetura (Opcional)

### 7.1 Separar `command.handler.ts` [MÉDIA]
**Estrutura proposta:**
```
src/handlers/commands/
  ├── index.ts (router)
  ├── status.ts
  ├── rank.ts
  ├── admin/
  │   ├── fix.ts
  │   ├── del.ts
  │   └── setcount.ts
```

### 7.2 Middleware de Admin [MÉDIA]
**Ação:** Centralizar verificação de admin em vez de repetir em cada comando

### 7.3 Extrair Duplicação no `message.handler.ts` [MÉDIA]
**Ação:** Unificar os 3 blocos de `attemptCount` em função reutilizável

---

## Arquivos a Modificar

| Arquivo | Mudanças |
|---------|----------|
| `src/database/supabase.ts` | Timeout, tipos |
| `src/database/repositories/user.repo.ts` | Retry, sanitização, verificação de erros, recalculateAll |
| `src/database/repositories/count.repo.ts` | Retry, tipos, getDailyStats |
| `src/handlers/command.handler.ts` | Validação, help, logging, cooldown cleanup |
| `src/handlers/message.handler.ts` | Feedback, logging |
| `src/services/whatsapp.ts` | Backoff, logging |
| `src/services/scheduler.ts` | Anti-duplicata, batch query |
| `src/core/counter.ts` | Cache |
| `src/utils/logger.ts` | (sem mudanças) |
| `src/utils/retry.ts` | NOVO - wrapper de retry |
| `src/config/constants.ts` | NOVO - constantes |
| `src/index.ts` | Graceful shutdown |

---

## Arquivos a Deletar

- `src/database/sqlite.ts`

---

## Ordem de Execução Recomendada

1. **Fase 1** - Bugs críticos/altos (segurança e integridade)
2. **Fase 3.1** - Padronizar logging (facilita debug)
3. **Fase 2** - Robustez
4. **Fase 3** - Qualidade restante
5. **Fase 4** - Performance
6. **Fase 5** - UX
7. **Fase 6** - Observabilidade
8. **Fase 7** - Refatoração (se tempo permitir)

---

## Verificação

Após implementação:
1. `npm run typecheck` - verificar erros de tipo
2. `npm run build` - garantir que compila
3. Testar manualmente:
   - Enviar foto e verificar contagem
   - Testar comandos `/status`, `/rank`, `/meu`
   - Testar comando admin `/fix`
   - Verificar logs estruturados

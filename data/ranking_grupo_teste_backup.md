# Ranking Correto - Para Aplicar no Redeploy

Data de referência: 2026-01-15

## Ranking Principal (Usuários Conhecidos):

| Usuário | Total |
|---------|-------|
| Bitten | 51 |
| Daniel Aspach | 35 |
| Ayeavopo (Alessandro Jucá) | 33 |
| Jonathan Slompo | 30 |
| João Oliveira | 30 |
| Josh | 27 |
| Gabryel Haertel | 18 |
| Mateus Tascheck | 17 |
| João Grechechen | 14 |
| Luis | 13 |
| Léo Trevisan | 10 |

**Subtotal conhecidos:** 278 cervejas

---

## Estratégia de Correção:

1. **Número total do bot:** Está correto (ex: 5393)
2. **Rankings individuais:** Aplicar a tabela acima
3. **Outros usuários:** Distribuir média entre 5-13 para completar o total
4. **Remover:** "async produçao" do ranking

### Fórmula:
```
Total_Outros = Total_Geral - Subtotal_Conhecidos (278)
```

---

## Para executar no redeploy:

1. Limpar tabela `users` (DELETE FROM users)
2. Inserir usuários da tabela acima com `/setuser`
3. Para outros usuários, distribuir o restante
4. Verificar que soma dos individuais = total geral

---

## Notas:
- O número que aparece após contagem (ex: "🍺 #5393") vem da tabela `counts`
- O ranking individual vem da tabela `users` 
- Precisam estar sincronizados

# 🍺 Beer Counter Bot

Bot para WhatsApp que gerencia a contagem coletiva de **1 milhão de cervejas**.

## 🚀 Início Rápido

### 1. Configurar ambiente

```bash
# Copie o arquivo de configuração
cp .env.example .env
```

Edite o `.env`:
```env
GROUP_ID=seu-grupo-id@g.us
INITIAL_COUNT=3872
ADMIN_NUMBERS=5511999999999,5511888888888
```

> **Dica**: Para descobrir o GROUP_ID, adicione o bot temporariamente sem filtro e veja os logs.

### 2. Instalar dependências

```bash
npm install
```

### 3. Executar

```bash
# Modo desenvolvimento (hot-reload)
npm run dev

# Ou modo produção
npm run build
npm start
```

### 4. Conectar WhatsApp

Na primeira execução, um **QR Code** aparecerá no terminal. Escaneie com o WhatsApp:
1. Abra WhatsApp no celular
2. Vá em **Configurações > Dispositivos conectados**
3. Toque em **Vincular dispositivo**
4. Escaneie o QR Code

## 📋 Comandos

| Comando | Descrição |
|---------|-----------|
| `/status` | Mostra contagem atual e progresso |
| `/rank` | Top 10 contribuidores |
| `/meu` | Suas estatísticas pessoais |
| `/audit` | Últimas 15 contagens |
| `/help` | Lista de comandos |

### Comandos Admin

| Comando | Descrição |
|---------|-----------|
| `/setcount <N>` | Define contagem inicial |
| `/fix <N>` | Força um número específico |

## 📊 Como Funciona

1. Usuário envia foto + número (ex: foto + "3873")
2. Bot valida se é o próximo número
3. Se válido: reage com ✅
4. Se conflito: reage com ⚠️ e explica o erro
5. Celebrações automáticas a cada 100 e 1000 cervejas!

## 📁 Estrutura

```
src/
├── config/         # Configurações
├── core/           # Lógica de negócio
├── database/       # SQLite e repositórios
├── handlers/       # Processamento de mensagens
├── services/       # WhatsApp (Baileys)
└── utils/          # Logger e helpers
```

## ⚠️ Notas Importantes

- **Backup**: O banco SQLite fica em `data/beer.db`
- **Auth**: Credenciais ficam em `auth_info/`
- **Grupos**: Configure o `GROUP_ID` para filtrar apenas um grupo

## 📜 Licença

MIT

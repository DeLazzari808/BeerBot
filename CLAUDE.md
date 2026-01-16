# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Beer Counter Bot - WhatsApp bot for a collective beer counting game (goal: 1 million beers). Built with TypeScript, Baileys (WhatsApp Web API), and Supabase.

## Common Commands

```bash
# Development with hot-reload
npm run dev

# Type checking only
npm run typecheck

# Production build
npm run build

# Run production
npm start
```

## Architecture

### Entry Point & Flow
- `src/index.ts` - Initializes Supabase connection, registers message/delete handlers, connects WhatsApp, starts daily recap scheduler
- Message flow: WhatsApp event → `whatsapp.ts` → `message.handler.ts` → `counter.ts` / `command.handler.ts`

### Core Logic (`src/core/`)
- `counter.ts` - Central counting service with `attemptCount()`, handles race conditions via Supabase constraints
- `validator.ts` - Sequence validation (VALID, DUPLICATE, SKIPPED, BEHIND statuses)
- `parser.ts` - Extracts numbers from message text
- `elo.ts` - Rank/tier system based on beer count

### Message Processing (`src/handlers/`)
- `message.handler.ts` - Auto-counting mode: photos automatically count even without number, wrong numbers auto-corrected
- `command.handler.ts` - Slash commands with 5-minute rate limiting for public commands, admin-only commands
- `delete.handler.ts` - Handles message deletions, updates counts

### Database Layer (`src/database/`)
- `supabase.ts` - Supabase client singleton with lazy initialization
- `repositories/count.repo.ts` - Beer count records (add, delete, force, daily stats)
- `repositories/user.repo.ts` - User stats and rankings with `recalculateAll()` for data consistency

### Services (`src/services/`)
- `whatsapp.ts` - Baileys wrapper: connection, QR auth, message/reaction sending
- `scheduler.ts` - Daily recap at 23:45

### Utilities (`src/utils/`)
- `queue.ts` - `SerialQueue` class serializes message processing to prevent race conditions
- `logger.ts` - Pino logger instance

## Key Patterns

**Race Condition Handling**: Messages queued via `messageQueue.add()` to serialize processing. Supabase unique constraints prevent duplicate counts.

**Auto-counting**: Photos without numbers (or with wrong numbers) are auto-counted to the next valid number. Only photos count - text-only messages are ignored.

**Admin Commands**: Identified via `config.adminNumbers`. Include `/fix`, `/setcount`, `/del`, `/setuser`, `/recalc`, `/recap`, `/audit`.

**Stats Time Restriction**: `/rank` command blocked before 18:00 for non-admins.

## Database Schema (Supabase)

**counts**: `id`, `number` (unique), `user_id`, `user_name`, `message_id`, `has_image`, `created_at`

**users**: `id`, `name`, `total_count`, `last_count_at`

## Environment Variables

Required in `.env`:
- `SUPABASE_URL`, `SUPABASE_KEY` - Database connection
- `GROUP_ID` - WhatsApp group JID (format: `xxxxx@g.us`)
- `ADMIN_NUMBERS` - Comma-separated WhatsApp IDs for admin access
- `INITIAL_COUNT` - Starting count if database is empty

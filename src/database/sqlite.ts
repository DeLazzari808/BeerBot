import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
    if (!db) {
        // Garante que o diretório existe
        const dir = path.dirname(config.paths.database);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        db = new Database(config.paths.database);
        db.pragma('journal_mode = WAL');

        runMigrations(db);
        logger.info('Database inicializado');
    }
    return db;
}

function runMigrations(database: Database.Database): void {
    database.exec(`
    -- Tabela de contagens
    CREATE TABLE IF NOT EXISTS counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT,
      message_id TEXT,
      has_image BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Tabela de usuários (ranking)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      total_count INTEGER DEFAULT 0,
      last_count_at DATETIME
    );

    -- Tabela de configuração
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Índices
    CREATE INDEX IF NOT EXISTS idx_counts_number ON counts(number);
    CREATE INDEX IF NOT EXISTS idx_counts_created ON counts(created_at);
    CREATE INDEX IF NOT EXISTS idx_users_total ON users(total_count DESC);
  `);
}

export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
    }
}

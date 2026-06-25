import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type DB = Database.Database;
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function defaultDbPath(): string {
  return process.env.SSC_DB && process.env.SSC_DB.length > 0
    ? process.env.SSC_DB
    : join(REPO_ROOT, 'data', 'steam.db');
}

export function openDb(path: string = defaultDbPath()): DB {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  ensureAuthTables(db);
  return db;
}

export function ensureAuthTables(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT UNIQUE,
      username TEXT, avatar TEXT, created_at INTEGER, last_login INTEGER);
    CREATE TABLE IF NOT EXISTS wishlist(
      user_id INTEGER, appid INTEGER, added_at INTEGER, PRIMARY KEY(user_id, appid));
  `);
}

export interface User { id: number; discord_id: string; username: string; avatar: string | null; }
export function getUserById(db: DB, id: number): User | undefined {
  return db.prepare('SELECT id, discord_id, username, avatar FROM users WHERE id = ?').get(id) as User | undefined;
}

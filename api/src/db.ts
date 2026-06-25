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

function addColumnIfMissing(db: DB, table: string, col: string, decl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
}

export function ensureAuthTables(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT UNIQUE,
      username TEXT, avatar TEXT, created_at INTEGER, last_login INTEGER);
    CREATE TABLE IF NOT EXISTS wishlist(
      user_id INTEGER, appid INTEGER, added_at INTEGER, PRIMARY KEY(user_id, appid));
  `);
  // 遷移:wishlist 加每款目標價(NULL=未設);與 worker 端一致
  addColumnIfMissing(db, 'wishlist', 'target_low_cents', 'INTEGER');
}

export interface User { id: number; discord_id: string; username: string; avatar: string | null; }
export function getUserById(db: DB, id: number): User | undefined {
  return db.prepare('SELECT id, discord_id, username, avatar FROM users WHERE id = ?').get(id) as User | undefined;
}

export function upsertUser(db: DB, me: { id: string; username: string; avatar: string | null }): number {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`INSERT INTO users(discord_id, username, avatar, created_at, last_login)
    VALUES(@id,@u,@a,@now,@now)
    ON CONFLICT(discord_id) DO UPDATE SET username=@u, avatar=@a, last_login=@now`)
    .run({ id: me.id, u: me.username, a: me.avatar, now });
  return (db.prepare('SELECT id FROM users WHERE discord_id = ?').get(me.id) as { id: number }).id;
}

export function addWish(db: DB, userId: number, appid: number, at: number): void {
  db.prepare('INSERT OR IGNORE INTO wishlist(user_id, appid, added_at) VALUES(?,?,?)').run(userId, appid, at);
}
export function removeWish(db: DB, userId: number, appid: number): void {
  db.prepare('DELETE FROM wishlist WHERE user_id = ? AND appid = ?').run(userId, appid);
}
export function listWish(db: DB, userId: number): number[] {
  return (db.prepare('SELECT appid FROM wishlist WHERE user_id = ? ORDER BY added_at DESC, appid')
    .all(userId) as { appid: number }[]).map(r => r.appid);
}
export function mergeWish(db: DB, userId: number, appids: number[], at: number): void {
  const stmt = db.prepare('INSERT OR IGNORE INTO wishlist(user_id, appid, added_at) VALUES(?,?,?)');
  const tx = db.transaction((ids: number[]) => { for (const id of ids) stmt.run(userId, id, at); });
  tx(appids);
}

// 目標價:設在 wishlist 列上(只對已收藏的遊戲生效;cents=null 清除)。
export function setTargetLow(db: DB, userId: number, appid: number, cents: number | null): void {
  db.prepare('UPDATE wishlist SET target_low_cents = ? WHERE user_id = ? AND appid = ?').run(cents, userId, appid);
}
export function listTargets(db: DB, userId: number): Record<number, number> {
  const rows = db.prepare(
    'SELECT appid, target_low_cents AS cents FROM wishlist WHERE user_id = ? AND target_low_cents IS NOT NULL')
    .all(userId) as { appid: number; cents: number }[];
  const out: Record<number, number> = {};
  for (const r of rows) out[r.appid] = r.cents;
  return out;
}

import Database from 'better-sqlite3';
import { evaluateLow } from '@ssc/shared';
export type DB = Database.Database;
export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS games(
      appid INTEGER PRIMARY KEY, name_zh TEXT, name_en TEXT, header_image TEXT,
      regular_price_cents INTEGER, is_free INTEGER DEFAULT 0, first_seen INTEGER, last_seen INTEGER);
    CREATE TABLE IF NOT EXISTS price_history(
      id INTEGER PRIMARY KEY AUTOINCREMENT, appid INTEGER, observed_at INTEGER,
      price_cents INTEGER, discount_percent INTEGER);
    CREATE INDEX IF NOT EXISTS idx_ph_appid_time ON price_history(appid, observed_at);
    CREATE TABLE IF NOT EXISTS game_stats(
      appid INTEGER PRIMARY KEY, observed_low_cents INTEGER, observed_low_at INTEGER,
      observed_max_discount INTEGER DEFAULT 0, seeded_low_cents INTEGER, seeded_at INTEGER);
    CREATE TABLE IF NOT EXISTS free_giveaways(
      id TEXT PRIMARY KEY, source TEXT, title TEXT, worth_usd TEXT, image TEXT,
      platforms TEXT, end_date TEXT, url TEXT, type TEXT, last_seen INTEGER);
  `);
  return db;
}
export interface Stats {
  observed_low_cents: number | null; observed_low_at: number | null;
  observed_max_discount: number; seeded_low_cents: number | null;
}
export function getStats(db: DB, appid: number): Stats | undefined {
  return db.prepare(
    `SELECT observed_low_cents, observed_low_at, observed_max_discount, seeded_low_cents
     FROM game_stats WHERE appid = ?`).get(appid) as Stats | undefined;
}
export interface PricePoint { t: number; price: number; }
export function getPriceHistory(db: DB, appid: number): PricePoint[] {
  return db.prepare(
    `SELECT observed_at AS t, price_cents AS price FROM price_history WHERE appid = ? ORDER BY observed_at ASC`,
  ).all(appid) as PricePoint[];
}
export function recordPriceAndLow(
  db: DB, appid: number, observedAt: number, priceCents: number, discountPercent: number,
): void {
  db.prepare(`INSERT INTO price_history(appid, observed_at, price_cents, discount_percent)
              VALUES(?,?,?,?)`).run(appid, observedAt, priceCents, discountPercent);
  const prev = getStats(db, appid);
  const prevLow = prev?.observed_low_cents ?? null;
  const { isNewLow, lowCents } = evaluateLow(priceCents, prevLow);
  const lowAt = isNewLow ? observedAt : prev!.observed_low_at;
  const maxDisc = Math.max(prev?.observed_max_discount ?? 0, discountPercent);
  db.prepare(`
    INSERT INTO game_stats(appid, observed_low_cents, observed_low_at, observed_max_discount)
    VALUES(@appid,@low,@lowAt,@maxDisc)
    ON CONFLICT(appid) DO UPDATE SET
      observed_low_cents=@low, observed_low_at=@lowAt, observed_max_discount=@maxDisc
  `).run({ appid, low: lowCents, lowAt, maxDisc });
}

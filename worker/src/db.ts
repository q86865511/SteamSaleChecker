import Database from 'better-sqlite3';
import { evaluateLow, type FreeGiveaway, type ReviewSummary, type NotifPrefs, type NotifDelivery } from '@ssc/shared';
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
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT UNIQUE,
      username TEXT, avatar TEXT, created_at INTEGER, last_login INTEGER);
    CREATE TABLE IF NOT EXISTS wishlist(
      user_id INTEGER, appid INTEGER, added_at INTEGER, PRIMARY KEY(user_id, appid));
    CREATE TABLE IF NOT EXISTS notifications(
      user_id INTEGER, appid INTEGER, notified_low_cents INTEGER, notified_at INTEGER,
      PRIMARY KEY(user_id, appid));
    CREATE TABLE IF NOT EXISTS report_gates(
      report_type TEXT PRIMARY KEY, last_sent_at INTEGER);
    CREATE TABLE IF NOT EXISTS game_reviews(
      appid INTEGER PRIMARY KEY, score_desc TEXT, positive_pct INTEGER, total INTEGER, reviewed_at INTEGER);
    CREATE TABLE IF NOT EXISTS game_genres(
      appid INTEGER, genre TEXT, PRIMARY KEY(appid, genre));
    CREATE TABLE IF NOT EXISTS notif_prefs(
      user_id INTEGER PRIMARY KEY, drop_enabled INTEGER NOT NULL DEFAULT 1,
      free_enabled INTEGER NOT NULL DEFAULT 0, digest_hours INTEGER NOT NULL DEFAULT 0,
      delivery TEXT NOT NULL DEFAULT 'channel', updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS notif_genres(
      user_id INTEGER, genre TEXT, PRIMARY KEY(user_id, genre));
    CREATE TABLE IF NOT EXISTS notif_free_sent(
      user_id INTEGER, giveaway_id TEXT, notified_at INTEGER, PRIMARY KEY(user_id, giveaway_id));
    CREATE TABLE IF NOT EXISTS notif_digest_gates(
      user_id INTEGER PRIMARY KEY, last_sent_at INTEGER);
  `);
  // 遷移:早期 free_giveaways 無 first_seen/notified/notified_at(SQLite 無 ADD COLUMN IF NOT EXISTS)
  addColumnIfMissing(db, 'free_giveaways', 'first_seen', 'INTEGER');
  addColumnIfMissing(db, 'free_giveaways', 'notified', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'free_giveaways', 'notified_at', 'INTEGER');
  // 遷移:wishlist 加每款目標價(NULL=未設);worker 通知時讀取
  addColumnIfMissing(db, 'wishlist', 'target_low_cents', 'INTEGER');
  return db;
}

function addColumnIfMissing(db: DB, table: string, col: string, decl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${decl}`);
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
// 長存表清理:刪除早於保留天數的價格點(史低存於 game_stats,不受影響);回刪除筆數。
export function prunePriceHistory(db: DB, keepDays: number, now: number): number {
  const cutoff = now - keepDays * 86400;
  return db.prepare('DELETE FROM price_history WHERE observed_at < ?').run(cutoff).changes;
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
export interface Wisher { userId: number; discordId: string; targetLowCents: number | null; }
export function getWishersForApp(db: DB, appid: number): Wisher[] {
  return db.prepare(
    `SELECT w.user_id AS userId, u.discord_id AS discordId, w.target_low_cents AS targetLowCents
     FROM wishlist w JOIN users u ON u.id = w.user_id
     WHERE w.appid = ? AND u.discord_id IS NOT NULL`).all(appid) as Wisher[];
}
export function alreadyNotified(db: DB, userId: number, appid: number, lowCents: number): boolean {
  const row = db.prepare('SELECT notified_low_cents FROM notifications WHERE user_id = ? AND appid = ?')
    .get(userId, appid) as { notified_low_cents: number } | undefined;
  return !!row && row.notified_low_cents <= lowCents;
}
export function markNotified(db: DB, userId: number, appid: number, lowCents: number, at: number): void {
  db.prepare(`INSERT INTO notifications(user_id, appid, notified_low_cents, notified_at)
    VALUES(@u,@a,@low,@at)
    ON CONFLICT(user_id, appid) DO UPDATE SET notified_low_cents=@low, notified_at=@at`)
    .run({ u: userId, a: appid, low: lowCents, at });
}

// --- 免費領取通知狀態 ---
export function giveawayCount(db: DB): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM free_giveaways').get() as { c: number }).c;
}
// 記錄/更新一筆 giveaway。新插入時 notified=seedNotified?1:0(首輪 seed 不通知,避免一次轟炸現有清單);
// 既有 id 只更新 last_seen 等、保留 notified 狀態。
export function recordGiveaway(db: DB, g: FreeGiveaway, now: number, seedNotified: boolean): void {
  db.prepare(`INSERT INTO free_giveaways(id,source,title,worth_usd,image,platforms,end_date,url,type,last_seen,first_seen,notified)
    VALUES(@id,@source,@title,@worth,@image,@platforms,@endDate,@url,@type,@now,@now,@notified)
    ON CONFLICT(id) DO UPDATE SET last_seen=@now, title=@title, end_date=@endDate, url=@url, worth_usd=@worth, image=@image`)
    .run({
      id: g.id, source: g.source, title: g.title, worth: g.worthUsd ?? null, image: g.image,
      platforms: g.platforms.join(','), endDate: g.endDate, url: g.url, type: g.type, now, notified: seedNotified ? 1 : 0,
    });
}
export interface PendingGiveaway {
  id: string; title: string; url: string; type: string; platforms: string; end_date: string | null; worth_usd: string | null;
}
export function pendingGiveaways(db: DB): PendingGiveaway[] {
  return db.prepare('SELECT id,title,url,type,platforms,end_date,worth_usd FROM free_giveaways WHERE notified=0').all() as PendingGiveaway[];
}
export function markGiveawayNotified(db: DB, id: string, now: number): void {
  db.prepare('UPDATE free_giveaways SET notified=1, notified_at=@now WHERE id=@id').run({ id, now });
}

// --- 通知偏好(per-user;worker 端讀取以決定對誰、用什麼方式發)---
const NOTIF_DEFAULTS = { dropEnabled: true, freeEnabled: false, digestHours: 0, delivery: 'channel' as NotifDelivery };
export function getNotifPrefsForUser(db: DB, userId: number): NotifPrefs {
  const row = db.prepare('SELECT drop_enabled, free_enabled, digest_hours, delivery FROM notif_prefs WHERE user_id = ?')
    .get(userId) as { drop_enabled: number; free_enabled: number; digest_hours: number; delivery: string } | undefined;
  const genres = (db.prepare('SELECT genre FROM notif_genres WHERE user_id = ? ORDER BY genre').all(userId) as { genre: string }[]).map(r => r.genre);
  if (!row) return { ...NOTIF_DEFAULTS, genres };
  return {
    dropEnabled: !!row.drop_enabled, freeEnabled: !!row.free_enabled,
    digestHours: row.digest_hours, delivery: row.delivery === 'dm' ? 'dm' : 'channel', genres,
  };
}
export interface FreeRecipient { userId: number; discordId: string; delivery: NotifDelivery; }
export function usersWantingFree(db: DB): FreeRecipient[] {
  return db.prepare(`SELECT p.user_id AS userId, u.discord_id AS discordId, p.delivery AS delivery
    FROM notif_prefs p JOIN users u ON u.id = p.user_id
    WHERE p.free_enabled = 1 AND u.discord_id IS NOT NULL`).all() as FreeRecipient[];
}
export function freeAlreadySent(db: DB, userId: number, giveawayId: string): boolean {
  return !!db.prepare('SELECT 1 FROM notif_free_sent WHERE user_id = ? AND giveaway_id = ?').get(userId, giveawayId);
}
export function freeSentCount(db: DB, userId: number): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM notif_free_sent WHERE user_id = ?').get(userId) as { c: number }).c;
}
export function markFreeSent(db: DB, userId: number, giveawayId: string, now: number): void {
  db.prepare('INSERT OR IGNORE INTO notif_free_sent(user_id, giveaway_id, notified_at) VALUES(?,?,?)').run(userId, giveawayId, now);
}
export interface DigestRecipient { userId: number; discordId: string; delivery: NotifDelivery; digestHours: number; }
export function usersWantingDigest(db: DB): DigestRecipient[] {
  return db.prepare(`SELECT p.user_id AS userId, u.discord_id AS discordId, p.delivery AS delivery, p.digest_hours AS digestHours
    FROM notif_prefs p JOIN users u ON u.id = p.user_id
    WHERE p.digest_hours > 0 AND u.discord_id IS NOT NULL`).all() as DigestRecipient[];
}
export function lastPersonalDigest(db: DB, userId: number): number | null {
  const r = db.prepare('SELECT last_sent_at AS m FROM notif_digest_gates WHERE user_id = ?').get(userId) as { m: number } | undefined;
  return r?.m ?? null;
}
export function recordPersonalDigest(db: DB, userId: number, now: number): void {
  db.prepare('INSERT INTO notif_digest_gates(user_id, last_sent_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET last_sent_at = ?')
    .run(userId, now, now);
}

// --- 報告 gating(每日/每週摘要)---
export function lastReportSent(db: DB, type: string): number | null {
  const r = db.prepare('SELECT last_sent_at AS m FROM report_gates WHERE report_type=?').get(type) as { m: number } | undefined;
  return r?.m ?? null;
}
export function recordReportSent(db: DB, type: string, now: number): void {
  db.prepare('INSERT INTO report_gates(report_type,last_sent_at) VALUES(?,?) ON CONFLICT(report_type) DO UPDATE SET last_sent_at=?')
    .run(type, now, now);
}

// --- 遊戲評價(Steam appreviews 摘要)---
export function getReview(db: DB, appid: number): ReviewSummary | undefined {
  // total IS NOT NULL 排除「負快取」列(抓取失敗只記了 reviewed_at)
  return db.prepare('SELECT score_desc AS scoreDesc, positive_pct AS positivePct, total FROM game_reviews WHERE appid=? AND total IS NOT NULL')
    .get(appid) as ReviewSummary | undefined;
}
export function reviewedAt(db: DB, appid: number): number | null {
  const r = db.prepare('SELECT reviewed_at AS t FROM game_reviews WHERE appid=?').get(appid) as { t: number } | undefined;
  return r?.t ?? null;
}
// 抓取失敗的負快取:只記 reviewed_at(保留既有評價),避免每輪重抓佔用刷新額度。
export function markReviewChecked(db: DB, appid: number, now: number): void {
  db.prepare('INSERT INTO game_reviews(appid, reviewed_at) VALUES(?, ?) ON CONFLICT(appid) DO UPDATE SET reviewed_at=?')
    .run(appid, now, now);
}

// --- games 索引(收藏頁:讓收藏的遊戲即使目前沒特價也有名稱/封面/史低)---
export function upsertGame(db: DB, appid: number, nameZh: string, headerImage: string, regularCents: number, isFree: boolean, now: number): void {
  db.prepare(`INSERT INTO games(appid,name_zh,header_image,regular_price_cents,is_free,first_seen,last_seen)
    VALUES(@a,@n,@h,@r,@f,@now,@now)
    ON CONFLICT(appid) DO UPDATE SET name_zh=@n, header_image=@h, regular_price_cents=@r, is_free=@f, last_seen=@now`)
    .run({ a: appid, n: nameZh, h: headerImage, r: regularCents, f: isFree ? 1 : 0, now });
}
export interface GameIndexEntry { appid: number; nameZh: string; headerImage: string; observedLowCents: number | null; observedLowAt: number | null; }
export function gamesIndex(db: DB): GameIndexEntry[] {
  return db.prepare(`SELECT g.appid AS appid, g.name_zh AS nameZh, g.header_image AS headerImage,
      s.observed_low_cents AS observedLowCents, s.observed_low_at AS observedLowAt
    FROM games g LEFT JOIN game_stats s ON s.appid = g.appid
    ORDER BY g.last_seen DESC`).all() as GameIndexEntry[];
}
// --- 類型(Steam genres,中文)---
// 全量取代某 app 的類型(DELETE→INSERT 交易);供類型篩選與通知類型偏好使用。
export function replaceGameGenres(db: DB, appid: number, genres: string[]): void {
  const del = db.prepare('DELETE FROM game_genres WHERE appid=?');
  const ins = db.prepare('INSERT OR IGNORE INTO game_genres(appid,genre) VALUES(?,?)');
  const tx = db.transaction((gs: string[]) => { del.run(appid); for (const g of gs) ins.run(appid, g); });
  tx(genres);
}
export function getGenresForApp(db: DB, appid: number): string[] {
  return (db.prepare('SELECT genre FROM game_genres WHERE appid=? ORDER BY genre').all(appid) as { genre: string }[]).map(r => r.genre);
}
export function allGenres(db: DB): string[] {
  return (db.prepare('SELECT DISTINCT genre FROM game_genres ORDER BY genre').all() as { genre: string }[]).map(r => r.genre);
}
export function upsertReview(db: DB, appid: number, rev: ReviewSummary, now: number): void {
  db.prepare(`INSERT INTO game_reviews(appid,score_desc,positive_pct,total,reviewed_at)
    VALUES(@a,@d,@p,@t,@now)
    ON CONFLICT(appid) DO UPDATE SET score_desc=@d, positive_pct=@p, total=@t, reviewed_at=@now`)
    .run({ a: appid, d: rev.scoreDesc, p: rev.positivePct, t: rev.total, now });
}

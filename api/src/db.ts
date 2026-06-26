import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NotifPrefs, GuildRouting, MentionMode } from '@ssc/shared';
export type { NotifPrefs };

// putNotifPrefs 接受的部分更新:scalar 部分合併,guild 子物件亦逐欄合併。
export type NotifPrefsPatch = Partial<Omit<NotifPrefs, 'guild'>> & { guild?: Partial<GuildRouting> };

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
    CREATE TABLE IF NOT EXISTS notif_prefs(
      user_id INTEGER PRIMARY KEY, drop_enabled INTEGER NOT NULL DEFAULT 1,
      free_enabled INTEGER NOT NULL DEFAULT 0, digest_hours INTEGER NOT NULL DEFAULT 0,
      delivery TEXT NOT NULL DEFAULT 'channel', updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS notif_genres(
      user_id INTEGER, genre TEXT, PRIMARY KEY(user_id, genre));
    CREATE TABLE IF NOT EXISTS user_bot_guilds(
      user_id INTEGER NOT NULL, guild_id TEXT NOT NULL, guild_name TEXT, joined_at INTEGER,
      PRIMARY KEY(user_id, guild_id));
  `);
  // 遷移:wishlist 加每款目標價(NULL=未設);與 worker 端一致
  addColumnIfMissing(db, 'wishlist', 'target_low_cents', 'INTEGER');
  // 遷移:notif_prefs 加 per-user 伺服器路由欄(皆可空;NULL=未設、沿用統一/全域)
  addColumnIfMissing(db, 'notif_prefs', 'guild_id', 'TEXT');
  addColumnIfMissing(db, 'notif_prefs', 'guild_channel_id', 'TEXT');     // 統一(預設)頻道
  addColumnIfMissing(db, 'notif_prefs', 'ch_drop', 'TEXT');              // per-type 覆蓋(NULL=沿用統一)
  addColumnIfMissing(db, 'notif_prefs', 'ch_free', 'TEXT');
  addColumnIfMissing(db, 'notif_prefs', 'ch_digest', 'TEXT');
  addColumnIfMissing(db, 'notif_prefs', 'mention_mode', "TEXT NOT NULL DEFAULT 'none'");
  addColumnIfMissing(db, 'notif_prefs', 'mention_role_id', 'TEXT');
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

// --- 已邀請 bot 的伺服器(picker 來源 + 所有權白名單)---
export function recordBotGuild(db: DB, userId: number, guildId: string, guildName: string, at: number): void {
  db.prepare(`INSERT INTO user_bot_guilds(user_id, guild_id, guild_name, joined_at)
    VALUES(@u,@g,@n,@at)
    ON CONFLICT(user_id, guild_id) DO UPDATE SET guild_name=@n`)
    .run({ u: userId, g: guildId, n: guildName, at });
}
export interface BotGuild { guildId: string; guildName: string | null; }
export function listBotGuilds(db: DB, userId: number): BotGuild[] {
  return db.prepare('SELECT guild_id AS guildId, guild_name AS guildName FROM user_bot_guilds WHERE user_id=? ORDER BY joined_at DESC')
    .all(userId) as BotGuild[];
}
export function userOwnsGuild(db: DB, userId: number, guildId: string): boolean {
  return !!db.prepare('SELECT 1 FROM user_bot_guilds WHERE user_id=? AND guild_id=?').get(userId, guildId);
}
export function removeBotGuild(db: DB, userId: number, guildId: string): void {
  db.prepare('DELETE FROM user_bot_guilds WHERE user_id=? AND guild_id=?').run(userId, guildId);
}

// --- 通知偏好(per-user)---
const PREFS_DEFAULTS: Omit<NotifPrefs, 'genres' | 'guild'> = { dropEnabled: true, freeEnabled: false, digestHours: 0, delivery: 'channel' };
const defaultGuildRouting = (): GuildRouting => ({
  guildId: null, guildName: null, channelId: null,
  channels: { drop: null, free: null, digest: null }, mention: { mode: 'none', roleId: null },
});
interface PrefsRow {
  drop_enabled: number; free_enabled: number; digest_hours: number; delivery: string;
  guild_id: string | null; guild_channel_id: string | null;
  ch_drop: string | null; ch_free: string | null; ch_digest: string | null;
  mention_mode: string | null; mention_role_id: string | null;
}
function guildRoutingFromRow(db: DB, userId: number, row: PrefsRow): GuildRouting {
  if (!row.guild_id) return defaultGuildRouting();
  const gn = db.prepare('SELECT guild_name FROM user_bot_guilds WHERE user_id=? AND guild_id=?')
    .get(userId, row.guild_id) as { guild_name: string | null } | undefined;
  return {
    guildId: row.guild_id, guildName: gn?.guild_name ?? null, channelId: row.guild_channel_id ?? null,
    channels: { drop: row.ch_drop ?? null, free: row.ch_free ?? null, digest: row.ch_digest ?? null },
    mention: { mode: (row.mention_mode as MentionMode) ?? 'none', roleId: row.mention_role_id ?? null },
  };
}
export function getNotifPrefs(db: DB, userId: number): NotifPrefs {
  const row = db.prepare(`SELECT drop_enabled, free_enabled, digest_hours, delivery,
      guild_id, guild_channel_id, ch_drop, ch_free, ch_digest, mention_mode, mention_role_id
    FROM notif_prefs WHERE user_id = ?`).get(userId) as PrefsRow | undefined;
  const genres = (db.prepare('SELECT genre FROM notif_genres WHERE user_id = ? ORDER BY genre').all(userId) as { genre: string }[]).map(r => r.genre);
  if (!row) return { ...PREFS_DEFAULTS, genres, guild: defaultGuildRouting() };
  return {
    dropEnabled: !!row.drop_enabled, freeEnabled: !!row.free_enabled, digestHours: row.digest_hours,
    // 'guild' 與 'dm' 都要原樣帶出;其餘(含未知)落回 'channel'
    delivery: (row.delivery === 'dm' || row.delivery === 'guild') ? row.delivery : 'channel',
    genres, guild: guildRoutingFromRow(db, userId, row),
  };
}
// guild routing 逐欄合併(單一合併真相:putNotifPrefs 與路由寫入前驗證共用)。
// null=清除須與 undefined=未提供區分,故用 'provided !== undefined' 而非 ??。
export function mergeGuildRouting(cur: GuildRouting, patch?: Partial<GuildRouting>): GuildRouting {
  const g = patch ?? {};
  const pick = <T>(provided: T | undefined, fallback: T): T => (provided !== undefined ? provided : fallback);
  return {
    guildId: pick(g.guildId, cur.guildId),
    guildName: pick(g.guildName, cur.guildName),
    channelId: pick(g.channelId, cur.channelId),
    channels: {
      drop: pick(g.channels?.drop, cur.channels.drop),
      free: pick(g.channels?.free, cur.channels.free),
      digest: pick(g.channels?.digest, cur.channels.digest),
    },
    mention: { mode: pick(g.mention?.mode, cur.mention.mode), roleId: pick(g.mention?.roleId, cur.mention.roleId) },
  };
}
// 部分合併:scalar 「有提供才覆蓋」;guild 子物件交給 mergeGuildRouting。
export function putNotifPrefs(db: DB, userId: number, p: NotifPrefsPatch, at: number): void {
  const cur = getNotifPrefs(db, userId);
  const mg = mergeGuildRouting(cur.guild, p.guild);
  const m = {
    dropEnabled: p.dropEnabled ?? cur.dropEnabled, freeEnabled: p.freeEnabled ?? cur.freeEnabled,
    digestHours: p.digestHours ?? cur.digestHours, delivery: p.delivery ?? cur.delivery,
  };
  db.prepare(`INSERT INTO notif_prefs(user_id,drop_enabled,free_enabled,digest_hours,delivery,
      guild_id,guild_channel_id,ch_drop,ch_free,ch_digest,mention_mode,mention_role_id,updated_at)
    VALUES(@u,@d,@f,@h,@dl,@gid,@gch,@cd,@cf,@cg,@mm,@mr,@at)
    ON CONFLICT(user_id) DO UPDATE SET drop_enabled=@d, free_enabled=@f, digest_hours=@h, delivery=@dl,
      guild_id=@gid, guild_channel_id=@gch, ch_drop=@cd, ch_free=@cf, ch_digest=@cg,
      mention_mode=@mm, mention_role_id=@mr, updated_at=@at`)
    .run({
      u: userId, d: m.dropEnabled ? 1 : 0, f: m.freeEnabled ? 1 : 0, h: m.digestHours, dl: m.delivery,
      gid: mg.guildId, gch: mg.channelId, cd: mg.channels.drop, cf: mg.channels.free, cg: mg.channels.digest,
      mm: mg.mention.mode, mr: mg.mention.roleId, at,
    });
  if (p.genres !== undefined) {
    const del = db.prepare('DELETE FROM notif_genres WHERE user_id = ?');
    const ins = db.prepare('INSERT OR IGNORE INTO notif_genres(user_id, genre) VALUES(?,?)');
    const tx = db.transaction((gs: string[]) => { del.run(userId); for (const g2 of gs) ins.run(userId, g2); });
    tx(p.genres);
  }
}

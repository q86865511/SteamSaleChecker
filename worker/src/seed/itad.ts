import type { DB } from '../db';
import { parseStoreLows, type StoreLow } from './itad-parse';

// 是否該刷新:從未 seed、或距上次 seed 已達間隔。純函式,便於測試。
export function shouldRefresh(lastSeededAt: number | null, now: number, minIntervalSec: number): boolean {
  if (lastSeededAt == null) return true;
  return now - lastSeededAt >= minIntervalSec;
}

// game_stats 中最近一次 seed 時間(unix 秒);無資料回 null。
export function lastSeededAt(db: DB): number | null {
  const r = db.prepare('SELECT MAX(seeded_at) AS m FROM game_stats').get() as { m: number | null } | undefined;
  return r?.m ?? null;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// 簡單線性退避重試:對 429/5xx/網路抖動有韌性。
async function withRetry<T>(fn: () => Promise<T>, tries = 3, baseMs = 600): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { lastErr = e; if (i < tries - 1) await sleep(baseMs * (i + 1)); }
  }
  throw lastErr;
}

async function lookupItadId(key: string, appid: number): Promise<string | null> {
  try {
    const j = await withRetry(() => fetchJson(
      `https://api.isthereanydeal.com/games/lookup/v1?key=${key}&appid=${appid}`)) as { game?: { id?: string } };
    return j?.game?.id ?? null;
  } catch { return null; }
}

// storelow/v2:body 為 ITAD game id 陣列;shops=61=Steam;country=TW
async function fetchStoreLows(key: string, ids: string[]): Promise<Map<string, StoreLow>> {
  try {
    const j = await withRetry(() => fetchJson(
      `https://api.isthereanydeal.com/games/storelow/v2?key=${key}&country=TW&shops=61`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids) }));
    return parseStoreLows(j);
  } catch { return new Map(); }
}

export interface SeedResult {
  appids: number; mapped: number; lows: number; written: number;
  currencies: Record<string, number>; nonTwd: number;
}
export interface SeedOptions {
  key: string;
  checkOnly?: boolean;       // 只查不寫(驗證 country=TW 回台幣)
  sleepMs?: number;          // lookup 之間的節流
  log?: (m: string) => void;
}

// 對 game_stats 內全部 appid 重新抓 ITAD(台灣區)史低並寫回。
// 供 CLI(npm run seed)與 worker 每日刷新共用。
export async function seedItadLows(db: DB, opts: SeedOptions): Promise<SeedResult> {
  const { key, checkOnly = false, sleepMs = 250 } = opts;
  const log = opts.log ?? ((m: string) => console.log(m));
  const appids = (db.prepare('SELECT appid FROM game_stats').all() as { appid: number }[]).map(r => r.appid);
  const res: SeedResult = { appids: appids.length, mapped: 0, lows: 0, written: 0, currencies: {}, nonTwd: 0 };
  if (appids.length === 0) { log('game_stats 為空,略過'); return res; }

  // 1) appid → ITAD game id
  const idMap = new Map<number, string>();
  for (const id of appids) {
    const g = await lookupItadId(key, id);
    if (g) idMap.set(id, g);
    await sleep(sleepMs);
  }
  res.mapped = idMap.size;

  // 2) 分批(每 200)抓各店史低
  const itadIds = [...idMap.values()];
  const lows = new Map<string, StoreLow>();
  for (let i = 0; i < itadIds.length; i += 200) {
    for (const [k, v] of await fetchStoreLows(key, itadIds.slice(i, i + 200))) lows.set(k, v);
  }
  res.lows = lows.size;

  // 3) 幣別驗證
  for (const v of lows.values()) {
    const c = v.currency || '?';
    res.currencies[c] = (res.currencies[c] ?? 0) + 1;
    if (v.currency && v.currency !== 'TWD') res.nonTwd++;
  }
  const dist = Object.entries(res.currencies).map(([c, n]) => `${c}:${n}`).join(' ');
  log(`對應 ITAD id:${res.mapped}/${appids.length} 史低:${res.lows} 幣別:${dist || '(無)'}`);
  if (res.nonTwd > 0) log(`⚠ 有 ${res.nonTwd} 筆非 TWD;請確認 country=TW 是否回台幣`);

  if (checkOnly) { log('--check:不寫入 DB'); return res; }

  // 4) 寫回。observed_low_at 僅在 seeded 史低成為/追平最低且有時間戳時改寫,讓史低日期誠實。
  const upd = db.prepare(`UPDATE game_stats SET
      seeded_low_cents=@low, seeded_at=@now,
      observed_low_at = CASE
        WHEN @lowAt IS NOT NULL AND @low <= COALESCE(observed_low_cents, @low)
        THEN @lowAt ELSE observed_low_at END,
      observed_low_cents = MIN(COALESCE(observed_low_cents, @low), @low)
    WHERE appid=@appid`);
  const now = Math.floor(Date.now() / 1000);
  for (const [appid, gid] of idMap) {
    const low = lows.get(gid);
    if (low != null) { upd.run({ appid, low: low.cents, lowAt: low.lowAt, now }); res.written++; }
  }
  log(`寫入 ${res.written} 款 game_stats`);
  return res;
}

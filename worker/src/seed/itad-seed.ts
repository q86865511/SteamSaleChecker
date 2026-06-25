import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { openDb, type DB } from '../db';
import { parseStoreLows, type StoreLow } from './itad-parse';

// seed 比 index.ts 深一層(worker/src/seed),故往上三層才是 repo 根。
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
loadEnv({ path: join(REPO_ROOT, 'api', '.env') });

const KEY = process.env.ITAD_API_KEY;
const DB_PATH = process.env.SSC_DB && process.env.SSC_DB.length > 0
  ? process.env.SSC_DB
  : join(REPO_ROOT, 'data', 'steam.db');
const CHECK_ONLY = process.argv.includes('--check'); // 只查不寫,用來驗證 country=TW 回台幣
const EXPECTED_CURRENCY = 'TWD';

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

async function lookupItadId(appid: number): Promise<string | null> {
  try {
    const j = await withRetry(() => fetchJson(
      `https://api.isthereanydeal.com/games/lookup/v1?key=${KEY}&appid=${appid}`)) as { game?: { id?: string } };
    return j?.game?.id ?? null;
  } catch { return null; }
}

// storelow/v2:body 為 ITAD game id 陣列;shops=61=Steam;country=TW
async function fetchStoreLows(ids: string[]): Promise<Map<string, StoreLow>> {
  try {
    const j = await withRetry(() => fetchJson(
      `https://api.isthereanydeal.com/games/storelow/v2?key=${KEY}&country=TW&shops=61`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids) }));
    return parseStoreLows(j);
  } catch { return new Map(); }
}

function seedAppids(db: DB): number[] {
  return (db.prepare('SELECT appid FROM game_stats').all() as { appid: number }[]).map(r => r.appid);
}

const main = async () => {
  if (!KEY) { console.error('需要 ITAD_API_KEY(寫進 api/.env 或設環境變數)'); process.exit(1); }
  const db = openDb(DB_PATH);
  const appids = seedAppids(db);
  console.log(`seed ${appids.length} 款${CHECK_ONLY ? '(--check 只查不寫)' : ''}`);
  if (appids.length === 0) {
    console.error('game_stats 為空 —— 請先跑 `npm -w @ssc/worker run run` 填充再 seed');
    process.exit(1);
  }

  // 1) appid → ITAD game id
  const idMap = new Map<number, string>();
  for (const id of appids) {
    const g = await lookupItadId(id);
    if (g) idMap.set(id, g);
    await sleep(250); // ITAD 友善節流
  }
  console.log(`對應到 ITAD id:${idMap.size}/${appids.length}`);

  // 2) 分批(每 200)抓各店史低
  const itadIds = [...idMap.values()];
  const lows = new Map<string, StoreLow>();
  for (let i = 0; i < itadIds.length; i += 200) {
    for (const [k, v] of await fetchStoreLows(itadIds.slice(i, i + 200))) lows.set(k, v);
  }

  // 3) 幣別驗證(country=TW 是否回台幣)
  const currencies = new Map<string, number>();
  for (const v of lows.values()) currencies.set(v.currency || '?', (currencies.get(v.currency || '?') ?? 0) + 1);
  const summary = [...currencies.entries()].map(([c, n]) => `${c}:${n}`).join(' ');
  console.log(`史低筆數:${lows.size} 幣別分布:${summary || '(無)'}`);
  const nonTwd = [...lows.values()].filter(v => v.currency && v.currency !== EXPECTED_CURRENCY).length;
  const sample = [...lows.values()].slice(0, 3).map(v => `${v.currency} ${(v.cents / 100).toLocaleString('en-US')}`);
  console.log(`抽樣:${sample.join(' / ') || '(無)'}`);
  if (nonTwd > 0) console.warn(`⚠ 有 ${nonTwd} 筆非 ${EXPECTED_CURRENCY};請確認 country=TW 是否如預期回台幣`);
  else if (lows.size > 0) console.log(`✓ 全部為 ${EXPECTED_CURRENCY}`);

  // 4) 寫回(--check 略過)
  if (CHECK_ONLY) { console.log('--check:不寫入 DB,結束'); return; }
  // observed_low_at 僅在「seeded 史低成為(或追平)最低」且有 ITAD 時間戳時才改寫,
  // 讓史低日期誠實反映真實史低;若我們自記的觀測價更低則保留原日期。
  const upd = db.prepare(`UPDATE game_stats SET
      seeded_low_cents=@low, seeded_at=@now,
      observed_low_at = CASE
        WHEN @lowAt IS NOT NULL AND @low <= COALESCE(observed_low_cents, @low)
        THEN @lowAt ELSE observed_low_at END,
      observed_low_cents = MIN(COALESCE(observed_low_cents, @low), @low)
    WHERE appid=@appid`);
  const now = Math.floor(Date.now() / 1000);
  let written = 0;
  for (const [appid, gid] of idMap) {
    const low = lows.get(gid);
    if (low != null) { upd.run({ appid, low: low.cents, lowAt: low.lowAt, now }); written++; }
  }
  console.log(`seed 完成:寫入 ${written} 款 game_stats`);
};
main().catch(e => { console.error(e); process.exit(1); });

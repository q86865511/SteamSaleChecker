import { join } from 'node:path';
import { openDb, type DB } from '../db';

const KEY = process.env.ITAD_API_KEY;
const DB_PATH = process.env.SSC_DB ?? join(process.cwd(), 'data', 'steam.db');

async function lookupItadId(appid: number): Promise<string | null> {
  const r = await fetch(`https://api.isthereanydeal.com/games/lookup/v1?key=${KEY}&appid=${appid}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j?.game?.id ?? null;
}

// storelow/v2:body 為 ITAD game id 陣列;shops=61=Steam;country=TW
async function fetchStoreLows(ids: string[]): Promise<Map<string, number>> {
  const r = await fetch(`https://api.isthereanydeal.com/games/storelow/v2?key=${KEY}&country=TW&shops=61`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids),
  });
  const out = new Map<string, number>();
  if (!r.ok) return out;
  const j = await r.json();
  for (const g of j ?? []) {
    const low = g?.lows?.[0]?.price?.amount;          // 元
    if (g?.id && typeof low === 'number') out.set(g.id, Math.round(low * 100)); // 轉分
  }
  return out;
}

function seedAppids(db: DB): number[] {
  return (db.prepare('SELECT appid FROM game_stats').all() as { appid: number }[]).map(r => r.appid);
}

const main = async () => {
  if (!KEY) { console.error('需要 ITAD_API_KEY'); process.exit(1); }
  const db = openDb(DB_PATH);
  const appids = seedAppids(db);
  console.log(`seed ${appids.length} 款`);
  const idMap = new Map<number, string>();
  for (const id of appids) { const g = await lookupItadId(id); if (g) idMap.set(id, g); await new Promise(r => setTimeout(r, 250)); }
  const itadIds = [...idMap.values()];
  // 分批(每 200)
  const lows = new Map<string, number>();
  for (let i = 0; i < itadIds.length; i += 200) {
    const batch = itadIds.slice(i, i + 200);
    for (const [k, v] of await fetchStoreLows(batch)) lows.set(k, v);
  }
  const upd = db.prepare(`UPDATE game_stats SET seeded_low_cents=@low, seeded_at=@now,
    observed_low_cents=MIN(COALESCE(observed_low_cents, @low), @low) WHERE appid=@appid`);
  const now = Math.floor(Date.now() / 1000);
  for (const [appid, gid] of idMap) {
    const low = lows.get(gid); if (low != null) upd.run({ appid, low, now });
  }
  console.log('seed 完成');
};
main().catch(e => { console.error(e); process.exit(1); });

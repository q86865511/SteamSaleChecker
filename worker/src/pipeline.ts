import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { DB } from './db';
import { recordPriceAndLow, getStats, getPriceHistory } from './db';
import { fetchFeatured, enrichMany, fetchTopSellerSpecialAppids } from './sources/steam';
import { fetchFreeGiveaways } from './sources/gamerpower';
import { writeJsonAtomic } from './bake';
import { isAtLow } from '@ssc/shared';
import type { Deal, FreeGiveaway, Meta } from '@ssc/shared';

export interface RunResult { deals: Deal[]; free: FreeGiveaway[]; meta: Meta; }

export async function runPipeline(
  db: DB, dataDir: string, nowSec: number, trackingSince: number, dealLimit = 120,
): Promise<RunResult> {
  // 1. 探索:搜尋熱銷特價(銷量排序)為主;featured specials 提供倒數時間與 fallback
  const featured = await fetchFeatured();
  const expMap = new Map<number, number>();
  for (const s of featured.specials) if (s.discountExpiration) expMap.set(s.appid, s.discountExpiration);

  let discovery = await fetchTopSellerSpecialAppids(dealLimit);
  if (discovery.length === 0) discovery = featured.specials.map(s => s.appid); // fallback
  const rankMap = new Map<number, number>();
  discovery.forEach((id, i) => rankMap.set(id, i));

  // 2. 補資料(台幣現價/原價/折扣/封面/繁中名)
  const enriched = await enrichMany(discovery);

  // 3. 寫價格歷史 + 維護最低;組 Deal(只收實際在特價者)
  const deals: Deal[] = [];
  for (const appid of discovery) {
    const a = enriched.get(appid);
    if (!a || !a.hasPrice || a.discountPercent <= 0) continue;
    recordPriceAndLow(db, appid, nowSec, a.priceCents, a.discountPercent);
    const st = getStats(db, appid);
    deals.push({
      appid,
      nameZh: a.nameZh,
      headerImage: a.headerImage,
      priceCents: a.priceCents,
      regularCents: a.regularCents,
      discountPercent: a.discountPercent,
      rank: rankMap.get(appid) ?? 9999,
      discountExpiration: expMap.get(appid),
      observedLowCents: st?.observed_low_cents ?? null,
      observedLowAt: st?.observed_low_at ?? null,
      isAtObservedLow: isAtLow(a.priceCents, st?.observed_low_cents ?? null),
      observedMaxDiscount: st?.observed_max_discount ?? a.discountPercent,
    });
  }
  deals.sort((x, y) => x.rank - y.rank);

  // 4. 免費領取
  const free = await fetchFreeGiveaways();

  // 5. 烤 JSON
  const meta: Meta = { generatedAt: nowSec, trackingSince, dealCount: deals.length, freeCount: free.length, ok: true };
  writeJsonAtomic(join(dataDir, 'deals.json'), deals);
  writeJsonAtomic(join(dataDir, 'free.json'), free);
  writeJsonAtomic(join(dataDir, 'meta.json'), meta);
  const histDir = join(dataDir, 'history');
  mkdirSync(histDir, { recursive: true });
  for (const d of deals) {
    writeJsonAtomic(join(histDir, `${d.appid}.json`), getPriceHistory(db, d.appid));
  }
  return { deals, free, meta };
}

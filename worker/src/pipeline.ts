import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { DB } from './db';
import { recordPriceAndLow, getStats, getPriceHistory, getReview, reviewedAt, upsertReview, markReviewChecked, upsertGame, gamesIndex, replaceGameGenres, allGenres } from './db';
import { fetchFeatured, enrichMany, fetchTopSellerSpecialAppids, fetchReviewSummary } from './sources/steam';
import { fetchFreeGiveaways } from './sources/gamerpower';
import { writeJsonAtomic } from './bake';
import { isAtLow, downsampleSpark } from '@ssc/shared';

const SPARK_POINTS = 24; // 列內迷你走勢圖的取樣點數
import type { Deal, FreeGiveaway, Meta, GameDetail } from '@ssc/shared';
import type { NewLow } from './notify';

export interface RunResult { deals: Deal[]; free: FreeGiveaway[]; meta: Meta; newLows: NewLow[]; }

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
  // 持久化遊戲基本資料(收藏頁需要:即使該遊戲目前沒特價也能顯示名稱/封面)
  for (const [appid, a] of enriched) {
    if (a.hasPrice || a.isFree) upsertGame(db, appid, a.nameZh, a.headerImage, a.regularCents, a.isFree, nowSec);
    if (a.genres?.length) replaceGameGenres(db, appid, a.genres);
  }

  // 3. 寫價格歷史 + 維護最低;組 Deal(只收實際在特價者)
  const deals: Deal[] = [];
  const newLows: NewLow[] = [];
  for (const appid of discovery) {
    const a = enriched.get(appid);
    if (!a || !a.hasPrice || a.discountPercent <= 0) continue;
    const prevLow = getStats(db, appid)?.observed_low_cents ?? null;
    recordPriceAndLow(db, appid, nowSec, a.priceCents, a.discountPercent);
    const st = getStats(db, appid);
    if (prevLow != null && a.priceCents < prevLow) {
      newLows.push({ appid, name: a.nameZh, lowCents: a.priceCents });
    }
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
      spark: downsampleSpark(getPriceHistory(db, appid).map(p => p.price), SPARK_POINTS),
      genres: a.genres,
    });
  }
  deals.sort((x, y) => x.rank - y.rank);

  // 3b. 評價:每輪刷新最多 30 款過期(>24h)者,其餘沿用快取;節流 ~1/s。
  // 失敗也「負快取」(markReviewChecked)避免每輪重抓佔額度;連續失敗達上限即中止本輪(節流/退避)。
  const REVIEW_TTL = 24 * 3600, MAX_REVIEW_FETCH = 30, MAX_CONSEC_FAIL = 5;
  let reviewFetched = 0, consecFail = 0;
  for (const d of deals) {
    const at = reviewedAt(db, d.appid);
    if ((at == null || nowSec - at > REVIEW_TTL) && reviewFetched < MAX_REVIEW_FETCH && consecFail < MAX_CONSEC_FAIL) {
      const rev = await fetchReviewSummary(d.appid);
      if (rev) { upsertReview(db, d.appid, rev, nowSec); consecFail = 0; }
      else { markReviewChecked(db, d.appid, nowSec); consecFail++; }
      reviewFetched++;
      await new Promise(r => setTimeout(r, 1100));
    }
    d.review = getReview(db, d.appid) ?? null;
  }

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
  // 商品詳細頁資料(豐富欄位來自本輪 enriched;沿用 deal 的價格/史低/評價)
  const detailDir = join(dataDir, 'detail');
  mkdirSync(detailDir, { recursive: true });
  for (const d of deals) {
    const a = enriched.get(d.appid);
    const detail: GameDetail = {
      appid: d.appid, nameZh: d.nameZh, headerImage: d.headerImage,
      priceCents: d.priceCents, regularCents: d.regularCents, discountPercent: d.discountPercent,
      discountExpiration: d.discountExpiration,
      observedLowCents: d.observedLowCents, observedLowAt: d.observedLowAt, isAtObservedLow: d.isAtObservedLow,
      review: d.review ?? null,
      shortDescription: a?.shortDescription, genres: a?.genres, releaseDate: a?.releaseDate, screenshots: a?.screenshots,
    };
    writeJsonAtomic(join(detailDir, `${d.appid}.json`), detail);
  }
  // 全遊戲輕量索引(收藏頁用)
  writeJsonAtomic(join(dataDir, 'games-index.json'), gamesIndex(db));
  // 全站類型聯集(類型篩選下拉、通知類型偏好用)
  writeJsonAtomic(join(dataDir, 'genres.json'), allGenres(db));
  return { deals, free, meta, newLows };
}

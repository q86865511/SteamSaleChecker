import type { DB } from './db';
import { giveawayCount, recordGiveaway, pendingGiveaways, markGiveawayNotified, getGiveawayAppid, setGiveawayAppid, getReview, upsertReview } from './db';
import { buildGiveawayEmbed, type GiveawayEnrich } from './embeds';
import { postChannelMessage } from './discord-bot';
import { searchSteamAppid, fetchAppDetails, fetchReviewSummary } from './sources/steam';
import { isSteamGiveaway, type FreeGiveaway, type ParsedApp } from '@ssc/shared';

const STEAM_ICON = process.env.SSC_STEAM_ICON_URL || undefined;

// 本輪 appid→appdetails 快取(跨 syncAndNotifyGiveaways 與 collectAndSendPersonalFree 共用,
// 避免同一輪對同款重抓 appdetails)。由 index.ts 每輪建立、傳入兩個流程。
export type AppCache = Map<number, ParsedApp | null>;

// 解析 giveaway 對應的 Steam 補強資料(完整版 embed 用);無對應/非 Steam/抓取失敗回 null(退精簡版)。
// appid 解析:成功或「查無對應」才快取於 free_giveaways.appid(0=查無);查詢失敗不快取 → 下輪重試
// (避免一次暫時性節流/網路錯誤把該 giveaway 永久鎖在精簡版)。appdetails 走本輪 appCache,評價走 DB 快取。
export async function enrichGiveaway(
  db: DB, g: { id: string; title: string; platforms: string }, now: number, appCache?: AppCache,
): Promise<GiveawayEnrich | null> {
  if (!isSteamGiveaway(g.platforms)) return null;
  let appid = getGiveawayAppid(db, g.id);
  if (appid === null) { // 尚未解析
    let found: number | null;
    try { found = await searchSteamAppid(g.title); }
    catch { return null; } // 查詢失敗:不快取(維持 NULL),下輪重試
    appid = found ?? 0;
    setGiveawayAppid(db, g.id, appid); // 含查無(0)→ 不再重查
  }
  if (appid <= 0) return null; // 0 哨兵 / 無對應

  let app = appCache?.get(appid);
  if (app === undefined) { // 本輪尚未抓(null 代表抓過但失敗,亦快取避免重抓)
    try { app = await fetchAppDetails(appid); }
    catch { app = null; }
    appCache?.set(appid, app ?? null);
  }
  if (!app) return null;

  let review = getReview(db, appid) ?? null;
  if (!review) {
    const r = await fetchReviewSummary(appid);
    if (r) { upsertReview(db, appid, r, now); review = r; }
  }
  return { appid, headerImage: app.headerImage, regularCents: app.regularCents, review };
}

// 記錄當前 giveaway 清單並通知「新出現」者(全域頻道公告)。
// 首輪(表空)只建立基線、不通知,避免一次轟炸所有現有清單;之後僅對 notified=0 的新項目發頻道公告。
// 回傳實際送出的通知數。(個人免費通知由 free-personal.ts 以 per-user 狀態獨立處理。)
export async function syncAndNotifyGiveaways(
  db: DB, free: FreeGiveaway[], botToken: string, channelId: string, now: number, appCache?: AppCache,
): Promise<number> {
  const seed = giveawayCount(db) === 0;
  for (const g of free) recordGiveaway(db, g, now, seed);
  if (seed) { console.log(`免費領取:首輪建立基線 ${free.length} 筆(不通知)`); return 0; }
  const MAX_PER_RUN = 8; // 每輪上限,避免 Discord 速率;其餘 backlog(含先前失敗者)下輪續發
  let sent = 0;
  for (const g of pendingGiveaways(db).slice(0, MAX_PER_RUN)) {
    try {
      const enrich = await enrichGiveaway(db, { id: g.id, title: g.title, platforms: g.platforms }, now, appCache);
      const payload = buildGiveawayEmbed(
        { title: g.title, url: g.url, type: g.type, platforms: g.platforms, end_date: g.end_date, worth_usd: g.worth_usd, image: g.image },
        enrich, { steamIcon: STEAM_ICON },
      );
      await postChannelMessage(botToken, channelId, payload); // 公告不 ping
      markGiveawayNotified(db, g.id, now);
      sent++;
      await new Promise(r => setTimeout(r, 1200)); // 尊重頻道速率(~5 則/5 秒)
    } catch (e) {
      console.warn('免費領取通知失敗', g.id, e instanceof Error ? e.message : e);
    }
  }
  return sent;
}

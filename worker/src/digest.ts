import type { DB } from './db';
import { lastReportSent, recordReportSent, usersWantingDigest, lastPersonalDigest, recordPersonalDigest, getGenresForApp, getNotifPrefsForUser } from './db';
import { shouldRefresh } from './seed/itad';
import { formatDigest, postChannelMessage, sendDm } from './discord-bot';
import type { Deal } from '@ssc/shared';

// 依使用者類型白名單過濾 deals(空白名單=不限)。純函式。
export function filterDealsByGenres<T extends { appid: number }>(
  deals: T[], allow: string[], genresByApp: Map<number, string[]>,
): T[] {
  if (allow.length === 0) return deals;
  return deals.filter(d => (genresByApp.get(d.appid) ?? []).some(g => allow.includes(g)));
}

// 每日/每週特價摘要(gated)。intervalSec<=0 視為停用。回傳是否送出。
// 空榜時仍推進 gate(避免每輪重試);發送失敗時不推進 gate(下輪重試)。
export async function maybeSendDigest(
  db: DB, deals: Deal[], botToken: string, channelId: string, now: number, intervalSec: number, topN = 5,
): Promise<boolean> {
  if (intervalSec <= 0) return false;
  if (!shouldRefresh(lastReportSent(db, 'digest'), now, intervalSec)) return false;
  const msg = formatDigest(deals, topN);
  if (!msg) { recordReportSent(db, 'digest', now); return false; }
  await postChannelMessage(botToken, channelId, msg);
  recordReportSent(db, 'digest', now);
  return true;
}

// 個人化摘要(per-user;訂閱 digest_hours>0 者)。各自 gate、依類型白名單過濾、依 delivery 發送。
// 空榜也推進 gate(避免每輪重試);發送失敗不推進(下輪重試)。回傳送出人數。
export async function maybeSendPersonalDigests(
  db: DB, deals: Deal[], botToken: string, channelId: string, now: number, topN = 5,
): Promise<number> {
  const recipients = usersWantingDigest(db);
  if (recipients.length === 0) return 0;
  const genresByApp = new Map<number, string[]>();
  for (const d of deals) genresByApp.set(d.appid, getGenresForApp(db, d.appid));
  let sent = 0;
  for (const r of recipients) {
    if (!shouldRefresh(lastPersonalDigest(db, r.userId), now, r.digestHours * 3600)) continue;
    const prefs = getNotifPrefsForUser(db, r.userId);
    const msg = formatDigest(filterDealsByGenres(deals, prefs.genres, genresByApp), topN);
    if (!msg) { recordPersonalDigest(db, r.userId, now); continue; }
    try {
      if (r.delivery === 'dm') await sendDm(botToken, r.discordId, msg);
      else await postChannelMessage(botToken, channelId, `<@${r.discordId}>\n${msg}`, true);
      recordPersonalDigest(db, r.userId, now);
      sent++;
      await new Promise(res => setTimeout(res, 1200));
    } catch (e) {
      console.warn('個人摘要失敗', r.userId, e instanceof Error ? e.message : e);
    }
  }
  return sent;
}

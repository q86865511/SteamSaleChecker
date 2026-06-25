import type { DB } from './db';
import { getWishersForApp, getGenresForApp, getNotifPrefsForUser, alreadyNotified, markNotified } from './db';
import { formatNotifyMessage, postChannelMessage, sendDm } from './discord-bot';
import type { NotifDelivery } from '@ssc/shared';

export interface NewLow { appid: number; name: string; lowCents: number; }
// 通知候選:每款在特價的遊戲(現價 + 是否本輪創新低)。
// drop 只在新低時發;target 看現價,跌破即發(不必是新低)。
export interface NotifyCandidate { appid: number; name: string; lowCents: number; isNewLow: boolean; }
export type NotifyReason = 'drop' | 'target';
export interface Pending {
  userId: number; discordId: string; appid: number; name: string; lowCents: number; reason: NotifyReason; delivery: NotifDelivery;
}

export interface NotifyDecisionInput {
  dropEnabled: boolean;          // 降價通知開關
  targetLowCents: number | null; // 目標價(null=未設)
  genres: string[];              // 使用者類型白名單(空=不限)
  appGenres: string[];           // 該遊戲類型
  lowCents: number;              // 現價
  isNewLow: boolean;             // 本輪是否創本站新低
}
// 決定某使用者對某遊戲是否通知、以何理由。純函式,便於 TDD。
// 規則:① 類型白名單非空且與遊戲類型無交集 → 不通知(drop 與 target 皆受限)。
//       ② 設了目標價 → 現價 ≤ target 才通知 target(不必是新低);否則 null(覆蓋 drop,設目標就只看目標)。
//       ③ 否則僅在「降價開且本輪創新低」時通知 drop(避免每輪洗頻)。
export function shouldNotifyNewLow(i: NotifyDecisionInput): NotifyReason | null {
  if (i.genres.length > 0 && !i.appGenres.some(g => i.genres.includes(g))) return null;
  if (i.targetLowCents != null) return i.lowCents <= i.targetLowCents ? 'target' : null;
  return (i.dropEnabled && i.isNewLow) ? 'drop' : null;
}

export function collectPending(db: DB, candidates: NotifyCandidate[]): Pending[] {
  const out: Pending[] = [];
  for (const c of candidates) {
    const appGenres = getGenresForApp(db, c.appid);
    for (const w of getWishersForApp(db, c.appid)) {
      const prefs = getNotifPrefsForUser(db, w.userId);
      const reason = shouldNotifyNewLow({
        dropEnabled: prefs.dropEnabled, targetLowCents: w.targetLowCents, genres: prefs.genres, appGenres, lowCents: c.lowCents, isNewLow: c.isNewLow,
      });
      if (!reason) continue;
      if (!alreadyNotified(db, w.userId, c.appid, c.lowCents)) {
        out.push({ userId: w.userId, discordId: w.discordId, appid: c.appid, name: c.name, lowCents: c.lowCents, reason, delivery: prefs.delivery });
      }
    }
  }
  return out;
}

export async function dispatchNotifications(
  db: DB, pending: Pending[], botToken: string, channelId: string, nowSec: number,
): Promise<number> {
  let sent = 0;
  for (const p of pending) {
    try {
      const content = formatNotifyMessage({ discordId: p.discordId, name: p.name, lowCents: p.lowCents, appid: p.appid, reason: p.reason });
      if (p.delivery === 'dm') await sendDm(botToken, p.discordId, content);
      else await postChannelMessage(botToken, channelId, content, true);
      markNotified(db, p.userId, p.appid, p.lowCents, nowSec);
      sent++;
    } catch (e) {
      console.warn(`通知發送失敗 user=${p.userId} app=${p.appid}:`, e);
    }
  }
  return sent;
}

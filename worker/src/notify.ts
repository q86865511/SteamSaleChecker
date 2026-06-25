import type { DB } from './db';
import { getWishersForApp, getGenresForApp, alreadyNotified, markNotified } from './db';
import { formatNotifyMessage, postChannelMessage } from './discord-bot';

export interface NewLow { appid: number; name: string; lowCents: number; }
export type NotifyReason = 'drop' | 'target';
export interface Pending {
  userId: number; discordId: string; appid: number; name: string; lowCents: number; reason: NotifyReason;
}

export interface NotifyDecisionInput {
  dropEnabled: boolean;          // 降價通知開關
  targetLowCents: number | null; // 目標價(null=未設)
  genres: string[];              // 使用者類型白名單(空=不限)
  appGenres: string[];           // 該遊戲類型
  lowCents: number;              // 本次新低
}
// 決定某使用者對某遊戲的新低是否通知、以何理由。純函式,便於 TDD。
// 規則:① 類型白名單非空且與遊戲類型無交集 → 不通知(drop 與 target 皆受限)。
//       ② 設了目標價 → 命中(low ≤ target)才通知 target;否則 null(覆蓋 drop,設目標就只看目標)。
//       ③ 否則看 drop 開關。
export function shouldNotifyNewLow(i: NotifyDecisionInput): NotifyReason | null {
  if (i.genres.length > 0 && !i.appGenres.some(g => i.genres.includes(g))) return null;
  if (i.targetLowCents != null) return i.lowCents <= i.targetLowCents ? 'target' : null;
  return i.dropEnabled ? 'drop' : null;
}

export function collectPending(db: DB, newLows: NewLow[]): Pending[] {
  const out: Pending[] = [];
  for (const nl of newLows) {
    const appGenres = getGenresForApp(db, nl.appid);
    for (const w of getWishersForApp(db, nl.appid)) {
      const reason = shouldNotifyNewLow({
        dropEnabled: true, targetLowCents: w.targetLowCents, genres: [], appGenres, lowCents: nl.lowCents,
      });
      if (!reason) continue;
      if (!alreadyNotified(db, w.userId, nl.appid, nl.lowCents)) {
        out.push({ userId: w.userId, discordId: w.discordId, appid: nl.appid, name: nl.name, lowCents: nl.lowCents, reason });
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
      await postChannelMessage(botToken, channelId,
        formatNotifyMessage({ discordId: p.discordId, name: p.name, lowCents: p.lowCents, appid: p.appid, reason: p.reason }), true);
      markNotified(db, p.userId, p.appid, p.lowCents, nowSec);
      sent++;
    } catch (e) {
      console.warn(`通知發送失敗 user=${p.userId} app=${p.appid}:`, e);
    }
  }
  return sent;
}

import type { DB } from './db';
import { getWishersForApp, alreadyNotified, markNotified } from './db';
import { formatNotifyMessage, postChannelMessage } from './discord-bot';

export interface NewLow { appid: number; name: string; lowCents: number; }
export interface Pending { userId: number; discordId: string; appid: number; name: string; lowCents: number; }

export function collectPending(db: DB, newLows: NewLow[]): Pending[] {
  const out: Pending[] = [];
  for (const nl of newLows) {
    for (const w of getWishersForApp(db, nl.appid)) {
      if (!alreadyNotified(db, w.userId, nl.appid, nl.lowCents)) {
        out.push({ userId: w.userId, discordId: w.discordId, appid: nl.appid, name: nl.name, lowCents: nl.lowCents });
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
        formatNotifyMessage({ discordId: p.discordId, name: p.name, lowCents: p.lowCents, appid: p.appid }), true);
      markNotified(db, p.userId, p.appid, p.lowCents, nowSec);
      sent++;
    } catch (e) {
      console.warn(`通知發送失敗 user=${p.userId} app=${p.appid}:`, e);
    }
  }
  return sent;
}

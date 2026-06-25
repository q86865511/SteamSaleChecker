import type { DB } from './db';
import { giveawayCount, recordGiveaway, pendingGiveaways, markGiveawayNotified } from './db';
import { formatGiveawayMessage, postChannelMessage } from './discord-bot';
import type { FreeGiveaway } from '@ssc/shared';

// 記錄當前 giveaway 清單並通知「新出現」者。
// 首輪(表空)只建立基線、不通知,避免一次轟炸所有現有清單;之後僅對 notified=0 的新項目發頻道公告。
// 回傳實際送出的通知數。
export async function syncAndNotifyGiveaways(
  db: DB, free: FreeGiveaway[], botToken: string, channelId: string, now: number,
): Promise<number> {
  const seed = giveawayCount(db) === 0;
  for (const g of free) recordGiveaway(db, g, now, seed);
  if (seed) { console.log(`免費領取:首輪建立基線 ${free.length} 筆(不通知)`); return 0; }
  let sent = 0;
  for (const g of pendingGiveaways(db)) {
    try {
      await postChannelMessage(botToken, channelId, formatGiveawayMessage(g));
      markGiveawayNotified(db, g.id, now);
      sent++;
    } catch (e) {
      console.warn('免費領取通知失敗', g.id, e instanceof Error ? e.message : e);
    }
  }
  return sent;
}

import type { DB } from './db';
import { usersWantingFree, freeAlreadySent, markFreeSent } from './db';
import { formatPersonalGiveawayMessage, postChannelMessage, sendDm } from './discord-bot';
import { isSteamGiveaway, type FreeGiveaway } from '@ssc/shared';

// 對 free_enabled 使用者,就「本輪新出現且未個別通知過」的 Steam 免費領取,依其 delivery 個別通知。
// 只取 newIds(本輪新出現)避免使用者剛開啟就被現有 backlog 轟炸;與既有全域頻道公告並存。
// 回傳送出筆數。失敗逐筆 try/catch,不標記(下輪重試),不中斷主流程。
export async function collectAndSendPersonalFree(
  db: DB, free: FreeGiveaway[], newIds: string[], botToken: string, channelId: string, now: number,
): Promise<number> {
  const newSet = new Set(newIds);
  const steamNew = free.filter(f => newSet.has(f.id) && isSteamGiveaway(f.platforms.join(',')));
  const recipients = usersWantingFree(db);
  if (steamNew.length === 0 || recipients.length === 0) return 0;
  const MAX_PER_RUN = 8; // 跨所有收件者的總上限,避免 Discord 速率;其餘下輪續發(freeAlreadySent 去重)
  let sent = 0;
  for (const r of recipients) {
    for (const g of steamNew) {
      if (sent >= MAX_PER_RUN) return sent;
      if (freeAlreadySent(db, r.userId, g.id)) continue;
      const content = formatPersonalGiveawayMessage(r.discordId, {
        title: g.title, url: g.url, type: g.type, platforms: g.platforms.join(','), end_date: g.endDate, worth_usd: g.worthUsd ?? null,
      });
      try {
        if (r.delivery === 'dm') await sendDm(botToken, r.discordId, content);
        else await postChannelMessage(botToken, channelId, content, true);
        markFreeSent(db, r.userId, g.id, now);
        sent++;
        await new Promise(res => setTimeout(res, 1200));
      } catch (e) {
        console.warn('個人免費通知失敗', r.userId, g.id, e instanceof Error ? e.message : e);
      }
    }
  }
  return sent;
}

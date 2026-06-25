import type { DB } from './db';
import { usersWantingFree, freeAlreadySent, markFreeSent, freeSentCount } from './db';
import { formatPersonalGiveawayMessage, postChannelMessage, sendDm } from './discord-bot';
import { isSteamGiveaway, type FreeGiveaway } from '@ssc/shared';

// 對 free_enabled 使用者個別通知 Steam 免費領取,依其 delivery 送。
// 防轟炸:使用者「首次出現在 notif_free_sent」時建立基線(把當下全部標為已送、不通知),
//         之後只通知新出現者。防遺失:feed 為「目前完整 Steam 清單」(非 run-scoped),
//         達上限未送者「不標記」→ 下輪續發(freeAlreadySent 去重)。回傳送出筆數。
export async function collectAndSendPersonalFree(
  db: DB, free: FreeGiveaway[], botToken: string, channelId: string, now: number,
): Promise<number> {
  const steam = free.filter(f => isSteamGiveaway(f.platforms.join(',')));
  const recipients = usersWantingFree(db);
  if (steam.length === 0 || recipients.length === 0) return 0;
  const MAX_PER_RUN = 8; // 跨所有收件者的總上限,避免 Discord 速率;未送者下輪續發
  let sent = 0;
  for (const r of recipients) {
    // 首次見到此使用者:建立基線(標記當下全部為已送、不通知),避免剛開啟就被現有清單轟炸
    if (freeSentCount(db, r.userId) === 0) {
      for (const g of steam) markFreeSent(db, r.userId, g.id, now);
      continue;
    }
    for (const g of steam) {
      if (sent >= MAX_PER_RUN) return sent; // 達上限:未送者不標記 → 下輪續發
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

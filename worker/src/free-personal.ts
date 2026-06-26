import type { DB } from './db';
import { usersWantingFree, freeAlreadySent, markFreeSent, freeSentCount, getNotifPrefsForUser } from './db';
import { postChannelMessage, sendDm } from './discord-bot';
import { buildGiveawayEmbed, type GiveawayEnrich } from './embeds';
import { enrichGiveaway, type AppCache } from './giveaways';
import { resolveTarget, mentionPrefix, allowedMentionsFor } from './route';
import { isSteamGiveaway, type FreeGiveaway } from '@ssc/shared';

const STEAM_ICON = process.env.SSC_STEAM_ICON_URL || undefined;

// 對 free_enabled 使用者個別通知 Steam 免費領取,依其 delivery 送。
// 防轟炸:使用者「首次出現在 notif_free_sent」時建立基線(把當下全部標為已送、不通知),
//         之後只通知新出現者。防遺失:feed 為「目前完整 Steam 清單」(非 run-scoped),
//         達上限未送者「不標記」→ 下輪續發(freeAlreadySent 去重)。回傳送出筆數。
export async function collectAndSendPersonalFree(
  db: DB, free: FreeGiveaway[], botToken: string, channelId: string, now: number, appCache?: AppCache,
): Promise<number> {
  const steam = free.filter(f => isSteamGiveaway(f.platforms.join(',')));
  const recipients = usersWantingFree(db);
  if (steam.length === 0 || recipients.length === 0) return 0;
  const MAX_PER_RUN = 8; // 跨所有收件者的總上限,避免 Discord 速率;未送者下輪續發
  // 每輪每款只補強一次(跨收件者重用;appid 與 appdetails 另有 DB / appCache 快取跨流程·跨輪重用)
  const enrichCache = new Map<string, GiveawayEnrich | null>();
  const getEnrich = async (g: FreeGiveaway): Promise<GiveawayEnrich | null> => {
    if (!enrichCache.has(g.id)) enrichCache.set(g.id, await enrichGiveaway(db, { id: g.id, title: g.title, platforms: g.platforms.join(',') }, now, appCache));
    return enrichCache.get(g.id) ?? null;
  };
  let sent = 0;
  for (const r of recipients) {
    // 首次見到此使用者:建立基線(標記當下全部為已送、不通知),避免剛開啟就被現有清單轟炸
    if (freeSentCount(db, r.userId) === 0) {
      for (const g of steam) markFreeSent(db, r.userId, g.id, now);
      continue;
    }
    // 取完整偏好(含 guild 路由;usersWantingFree 只帶 delivery)。免費類型路由到 'free' 頻道。
    const prefs = getNotifPrefsForUser(db, r.userId);
    const tgt = resolveTarget(prefs.delivery, prefs.guild, 'free', channelId);
    for (const g of steam) {
      if (sent >= MAX_PER_RUN) return sent; // 達上限:未送者不標記 → 下輪續發
      if (freeAlreadySent(db, r.userId, g.id)) continue;
      const enrich = await getEnrich(g);
      const payload = buildGiveawayEmbed(
        { title: g.title, url: g.url, type: g.type, platforms: g.platforms.join(','), end_date: g.endDate, worth_usd: g.worthUsd ?? null, image: g.image },
        enrich, { mention: r.discordId, mentionText: tgt.useGuildMention ? mentionPrefix(prefs.guild.mention, r.discordId) : undefined, steamIcon: STEAM_ICON },
      );
      try {
        if (tgt.kind === 'dm') await sendDm(botToken, r.discordId, payload);
        else await postChannelMessage(botToken, tgt.channelId!, payload, tgt.useGuildMention ? allowedMentionsFor(prefs.guild.mention, r.discordId) : true);
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

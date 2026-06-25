import { formatTwd } from '@ssc/shared';

export function formatNotifyMessage(p: { discordId: string; name: string; lowCents: number; appid: number }): string {
  return `<@${p.discordId}> 🎮 你收藏的《${p.name}》創新低 ${formatTwd(p.lowCents)}!\n` +
    `https://store.steampowered.com/app/${p.appid}/`;
}

// 新免費領取的頻道公告(無 @mention)。
export function formatGiveawayMessage(g: {
  title: string; url: string; type: string; platforms: string; end_date?: string | null; worth_usd?: string | null;
}): string {
  const plats = g.platforms ? g.platforms.split(',').slice(0, 3).join('、') : '';
  const worth = g.worth_usd ? `(價值 ${g.worth_usd})` : '';
  const end = g.end_date ? `,${g.end_date.slice(0, 10)} 前領取` : '';
  const kind = g.type === 'dlc' ? '免費 DLC' : '免費遊戲';
  const link = /^https?:\/\//i.test(g.url) ? `\n${g.url}` : ''; // 只放 http(s) 連結
  return `🆓 ${kind}:**${g.title}**${worth}${plats ? ` — ${plats}` : ''}${end}${link}`;
}

// 特價精選摘要(每日/每週報告);依折扣高→低取 TopN;空回 null。
export function formatDigest(
  deals: { nameZh: string; discountPercent: number; priceCents: number; appid: number }[], topN = 5,
): string | null {
  const top = [...deals].sort((a, b) => b.discountPercent - a.discountPercent).slice(0, topN);
  if (top.length === 0) return null;
  const lines = top.map((d, i) => `${i + 1}. **${d.nameZh}** -${d.discountPercent}% ${formatTwd(d.priceCents)}`);
  return `📊 Steam 特價精選 Top ${top.length}\n${lines.join('\n')}\nhttps://steam.terrychou.com/`;
}

// allowMentions 預設 false:頻道公告(免費/摘要)不解析任何 mention,避免被外部標題注入 <@id> 觸發 ping。
// 僅個人降價通知(formatNotifyMessage,含 <@discordId>)需傳 true。
export async function postChannelMessage(
  botToken: string, channelId: string, content: string, allowMentions = false,
): Promise<void> {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: allowMentions ? { parse: ['users'] } : { parse: [] } }),
  });
  if (!res.ok) throw new Error(`discord post ${res.status}`);
}

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
  return `🆓 ${kind}:**${g.title}**${worth}${plats ? ` — ${plats}` : ''}${end}\n${g.url}`;
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

export async function postChannelMessage(botToken: string, channelId: string, content: string): Promise<void> {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: ['users'] } }),
  });
  if (!res.ok) throw new Error(`discord post ${res.status}`);
}

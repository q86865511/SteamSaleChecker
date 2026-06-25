import { formatTwd } from '@ssc/shared';

export function formatNotifyMessage(
  p: { discordId: string; name: string; lowCents: number; appid: number; reason?: 'drop' | 'target' },
): string {
  const verb = p.reason === 'target' ? '跌破你設定的目標價' : '創新低';
  return `<@${p.discordId}> 🎮 你收藏的《${p.name}》${verb} ${formatTwd(p.lowCents)}!\n` +
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

// 個人免費領取通知(私訊或頻道 @);沿用頻道公告措辭並前綴 mention。
export function formatPersonalGiveawayMessage(discordId: string, g: {
  title: string; url: string; type: string; platforms: string; end_date?: string | null; worth_usd?: string | null;
}): string {
  return `<@${discordId}> ${formatGiveawayMessage(g)}`;
}

// 私訊使用者:先開 DM 頻道(POST /users/@me/channels),再對該頻道發訊息。
// DM 關閉/封鎖會回 403 → throw,由呼叫端 try/catch、記錄、不標記(下輪重試),不中斷主流程。
export async function sendDm(botToken: string, recipientId: string, content: string): Promise<void> {
  const open = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient_id: recipientId }),
  });
  if (!open.ok) throw new Error(`dm open ${open.status}`);
  const { id } = (await open.json()) as { id: string };
  const res = await fetch(`https://discord.com/api/v10/channels/${id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
  if (!res.ok) throw new Error(`dm post ${res.status}`);
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

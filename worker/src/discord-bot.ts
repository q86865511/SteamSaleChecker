import { formatTwd } from '@ssc/shared';

export function formatNotifyMessage(p: { discordId: string; name: string; lowCents: number; appid: number }): string {
  return `<@${p.discordId}> 🎮 你收藏的《${p.name}》創新低 ${formatTwd(p.lowCents)}!\n` +
    `https://store.steampowered.com/app/${p.appid}/`;
}

export async function postChannelMessage(botToken: string, channelId: string, content: string): Promise<void> {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: ['users'] } }),
  });
  if (!res.ok) throw new Error(`discord post ${res.status}`);
}

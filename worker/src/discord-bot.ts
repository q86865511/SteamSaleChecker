import type { MessagePayload } from './embeds';

// 訊息排版(embed/按鈕)由 embeds.ts 的 builder 負責;本檔只管傳輸。
// payload 為字串時自動包成 { content }(保留純文字相容)。
const normalize = (p: string | MessagePayload): MessagePayload => (typeof p === 'string' ? { content: p } : p);

// 私訊使用者:先開 DM 頻道(POST /users/@me/channels),再對該頻道發訊息。
// DM 關閉/封鎖會回 403 → throw,由呼叫端 try/catch、記錄、不標記(下輪重試),不中斷主流程。
export async function sendDm(botToken: string, recipientId: string, payload: string | MessagePayload): Promise<void> {
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
    body: JSON.stringify({ ...normalize(payload), allowed_mentions: { parse: [] } }),
  });
  if (!res.ok) throw new Error(`dm post ${res.status}`);
}

// allowMentions 預設 false:頻道公告(免費/摘要)不解析任何 mention,避免被外部標題注入 <@id> 觸發 ping。
// 個人通知(content 含 <@discordId>)需傳 true 才會 ping。
export async function postChannelMessage(
  botToken: string, channelId: string, payload: string | MessagePayload, allowMentions = false,
): Promise<void> {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...normalize(payload),
      allowed_mentions: allowMentions ? { parse: ['users'] } : { parse: [] },
    }),
  });
  if (!res.ok) throw new Error(`discord post ${res.status}`);
}

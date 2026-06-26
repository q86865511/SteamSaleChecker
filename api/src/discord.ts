const DISCORD_API = 'https://discord.com/api';

export interface DiscordMe { id: string; username: string; avatar: string | null; }

export function buildAuthorizeUrl(p: { clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: 'identify guilds.join',
    state: p.state,
  });
  return `${DISCORD_API}/oauth2/authorize?${q.toString()}`;
}

export async function exchangeCode(p: { code: string; clientId: string; clientSecret: string; redirectUri: string }): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: p.code,
    client_id: p.clientId,
    client_secret: p.clientSecret,
    redirect_uri: p.redirectUri,
  });
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`token exchange ${res.status}`);
  const j = (await res.json()) as { access_token: string };
  return j.access_token;
}

export async function fetchMe(accessToken: string): Promise<DiscordMe> {
  const res = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`fetch me ${res.status}`);
  const j = (await res.json()) as { id: string; username: string; avatar: string | null };
  return { id: j.id, username: j.username, avatar: j.avatar };
}

export async function addGuildMember(botToken: string, guildId: string, discordId: string, accessToken: string): Promise<void> {
  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`, {
    method: 'PUT',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken }),
  });
  // 201 = added, 204 = already a member
  if (res.status !== 201 && res.status !== 204) throw new Error(`add member ${res.status}`);
}

// --- 邀請 bot 進使用者自己的伺服器 + per-user 頻道路由 ---

// 安裝權限:VIEW_CHANNEL(1<<10) + SEND_MESSAGES(1<<11) + EMBED_LINKS(1<<14)。embed 通知需要 EMBED_LINKS。
export const BOT_INVITE_PERMISSIONS = (1 << 10) | (1 << 11) | (1 << 14); // 19456

// bot 邀請授權 URL。重點:scope 必須含「bot」與一個額外 scope(這裡用 guilds),
// 否則純 scope=bot 是 serverless/callback-less,Discord 不會 redirect 回來帶 guild_id。
// 帶 guilds scope 後升級為 authorization-code grant:回跳會帶 code/guild_id/permissions/state,
// 之後用 code 換使用者 token 呼叫 /users/@me/guilds 驗證使用者真的管理該 guild。
export function buildBotInviteUrl(p: { clientId: string; redirectUri: string; state: string; permissions?: number }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    scope: 'bot guilds',
    permissions: String(p.permissions ?? BOT_INVITE_PERMISSIONS),
    redirect_uri: p.redirectUri,
    response_type: 'code',
    state: p.state,
  });
  return `${DISCORD_API}/oauth2/authorize?${q.toString()}`;
}

export interface UserGuild { id: string; name: string; owner?: boolean; permissions?: string; }
// 使用者 OAuth token 取得其所屬伺服器(含 owner / permissions 位元,供管理權驗證)。
export async function listUserGuilds(accessToken: string): Promise<UserGuild[]> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`list user guilds ${res.status}`);
  return (await res.json()) as UserGuild[];
}
const MANAGE_GUILD = 0x20n; // MANAGE_GUILD 權限位
// 純函式:使用者是否真有此 guild 的管理權(擁有者或具 MANAGE_GUILD)。callback 的 guild_id 可偽造,必須靠這個。
export function userCanManageGuild(g: { owner?: boolean; permissions?: string }): boolean {
  if (g.owner) return true;
  try { return (BigInt(g.permissions ?? '0') & MANAGE_GUILD) === MANAGE_GUILD; } catch { return false; }
}

export interface DiscordChannelRaw { id: string; name: string; type: number; position: number; }
// bot token 列出 guild 頻道(REST,不需任何 privileged gateway intent,只需 bot 在該 guild)。
export async function listGuildChannels(botToken: string, guildId: string): Promise<DiscordChannelRaw[]> {
  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers: { Authorization: `Bot ${botToken}` } });
  if (!res.ok) throw new Error(`list channels ${res.status}`);
  return (await res.json()) as DiscordChannelRaw[];
}
// 純函式:只留文字(0)/公告(5)頻道,依 position→name 排序。
export function textChannelsOnly(chs: DiscordChannelRaw[]): DiscordChannelRaw[] {
  return chs.filter(c => c.type === 0 || c.type === 5)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

export interface DiscordRoleRaw { id: string; name: string; position: number; managed: boolean; }
export async function listGuildRoles(botToken: string, guildId: string): Promise<DiscordRoleRaw[]> {
  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${botToken}` } });
  if (!res.ok) throw new Error(`list roles ${res.status}`);
  return (await res.json()) as DiscordRoleRaw[];
}
// 純函式:可標記的身分組(去掉 @everyone(id===guildId)與 managed/整合型),依 position 由高到低。
export function mentionableRoles(roles: DiscordRoleRaw[], guildId: string): DiscordRoleRaw[] {
  return roles.filter(r => r.id !== guildId && !r.managed).sort((a, b) => b.position - a.position);
}

// 對某頻道送一則訊息(bot token)。供測試通知按鈕用;回 HTTP 狀態碼讓呼叫端分辨 403/404。
export async function postBotMessage(botToken: string, channelId: string, payload: object): Promise<number> {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }),
  });
  return res.status;
}

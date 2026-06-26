import { apiBase } from './wishlist';
import type { NotifPrefs, GuildRouting, DiscordChannel, DiscordRole } from '@ssc/shared';

// 部分更新:scalar 部分覆蓋,guild 子物件可逐欄部分覆蓋(後端 partial-merge)。
export type NotifPrefsPatch = Partial<Omit<NotifPrefs, 'guild'>> & { guild?: Partial<GuildRouting> };
export interface ConnectedGuild { guildId: string; guildName: string | null; }
export type TestReason = 'forbidden' | 'no_channel' | 'error';

function api(path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(apiBase() + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
}

// 通知偏好
export async function getNotifPrefs(): Promise<NotifPrefs | null> {
  try { const r = await api('/api/notif/prefs'); return r.ok ? (await r.json()) as NotifPrefs : null; }
  catch { return null; }
}
export async function putNotifPrefs(p: NotifPrefsPatch): Promise<boolean> {
  try { const r = await api('/api/notif/prefs', { method: 'PUT', body: JSON.stringify(p) }); return r.ok; }
  catch { return false; }
}

// --- Discord 伺服器連線(邀請機器人後的路由設定)---
export async function getConnectedGuilds(): Promise<ConnectedGuild[]> {
  try { const r = await api('/api/bot/guilds'); return r.ok ? ((await r.json()) as { guilds: ConnectedGuild[] }).guilds : []; }
  catch { return []; }
}
export async function getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
  try { const r = await api(`/api/bot/guilds/${encodeURIComponent(guildId)}/channels`); return r.ok ? ((await r.json()) as { channels: DiscordChannel[] }).channels : []; }
  catch { return []; }
}
export async function getGuildRoles(guildId: string): Promise<DiscordRole[]> {
  try { const r = await api(`/api/bot/guilds/${encodeURIComponent(guildId)}/roles`); return r.ok ? ((await r.json()) as { roles: DiscordRole[] }).roles : []; }
  catch { return []; }
}
export async function sendTestNotification(): Promise<{ ok: boolean; reason?: TestReason }> {
  try {
    const r = await api('/api/bot/test', { method: 'POST', body: '{}' });
    const body = await r.json().catch(() => ({})) as { ok?: boolean; reason?: TestReason };
    return body.ok ? { ok: true } : { ok: false, reason: body.reason ?? 'error' };
  } catch { return { ok: false, reason: 'error' }; }
}
export async function disconnectGuild(guildId?: string): Promise<boolean> {
  try { const r = await api('/api/bot/disconnect', { method: 'POST', body: JSON.stringify(guildId ? { guildId } : {}) }); return r.ok; }
  catch { return false; }
}

// 目標價:appid → 目標 cents(只含已設定者)
export async function getTargets(): Promise<Record<number, number>> {
  try { const r = await api('/api/wishlist/targets'); return r.ok ? (await r.json()) as Record<number, number> : {}; }
  catch { return {}; }
}
export async function putTarget(appid: number, cents: number | null): Promise<boolean> {
  try {
    const r = await api(`/api/wishlist/${appid}/target`, { method: 'PUT', body: JSON.stringify({ targetLowCents: cents }) });
    return r.ok;
  } catch { return false; }
}

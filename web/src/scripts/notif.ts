import { apiBase } from './wishlist';
import type { NotifPrefs } from '@ssc/shared';

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
export async function putNotifPrefs(p: Partial<NotifPrefs>): Promise<boolean> {
  try { const r = await api('/api/notif/prefs', { method: 'PUT', body: JSON.stringify(p) }); return r.ok; }
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

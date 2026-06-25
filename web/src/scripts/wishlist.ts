const LS_KEY = 'ssc-wishlist';

export function apiBase(): string {
  if (typeof location !== 'undefined' && location.port === '4321') return 'http://localhost:8787';
  return '';
}
export interface Me { id: number; username: string; avatar: string | null; }

function api(path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(apiBase() + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
}
export async function getMe(): Promise<Me | null> {
  try { const r = await api('/api/me'); return r.ok ? (await r.json()) as Me : null; } catch { return null; }
}
export function getLocal(): number[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as number[]; } catch { return []; }
}
function setLocal(ids: number[]): void { localStorage.setItem(LS_KEY, JSON.stringify([...new Set(ids)])); }
export async function loadWishlist(loggedIn: boolean): Promise<Set<number>> {
  if (loggedIn) {
    try { const r = await api('/api/wishlist'); return new Set(r.ok ? (await r.json()) as number[] : []); }
    catch { return new Set(); }
  }
  return new Set(getLocal());
}
export async function addWish(appid: number, loggedIn: boolean): Promise<void> {
  if (loggedIn) await api('/api/wishlist', { method: 'POST', body: JSON.stringify({ appid }) });
  else setLocal([...getLocal(), appid]);
}
export async function removeWish(appid: number, loggedIn: boolean): Promise<void> {
  if (loggedIn) await api(`/api/wishlist/${appid}`, { method: 'DELETE' });
  else setLocal(getLocal().filter(x => x !== appid));
}
export async function mergeLocalOnLogin(): Promise<void> {
  const local = getLocal();
  if (!local.length) return;
  await api('/api/wishlist/merge', { method: 'POST', body: JSON.stringify({ appids: local }) });
  localStorage.removeItem(LS_KEY);
}
export function discordLoginUrl(): string { return apiBase() + '/auth/discord'; }
export async function logout(): Promise<void> { await api('/auth/logout', { method: 'POST' }); }
// Phase D:從公開 Steam 願望單匯入(後端抓取);回傳匯入數與最新收藏,失敗回 null。
export async function importSteamWishlist(steamId: string): Promise<{ imported: number; wishlist: number[] } | null> {
  try {
    const r = await api('/api/wishlist/import', { method: 'POST', body: JSON.stringify({ steamId }) });
    return r.ok ? (await r.json()) as { imported: number; wishlist: number[] } : null;
  } catch { return null; }
}

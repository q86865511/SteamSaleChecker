import { apiBase } from './wishlist';

function api(path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(apiBase() + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
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

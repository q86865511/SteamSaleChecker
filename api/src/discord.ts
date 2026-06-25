const DISCORD_API = 'https://discord.com/api';

export interface DiscordMe { id: string; username: string; avatar: string | null; }

export function buildAuthorizeUrl(p: { clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: 'identify',
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

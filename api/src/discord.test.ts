import { describe, it, expect } from 'vitest';
import { buildAuthorizeUrl } from './discord';

describe('buildAuthorizeUrl', () => {
  it('組出正確的 Discord 授權 URL', () => {
    const url = buildAuthorizeUrl({ clientId: 'abc123', redirectUri: 'http://localhost:8787/auth/callback', state: 'xyz' });
    expect(url.startsWith('https://discord.com/api/oauth2/authorize?')).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get('response_type')).toBe('code');
    expect(q.get('client_id')).toBe('abc123');
    expect(q.get('redirect_uri')).toBe('http://localhost:8787/auth/callback');
    expect(q.get('scope')).toBe('identify guilds.join');
    expect(q.get('state')).toBe('xyz');
  });
});

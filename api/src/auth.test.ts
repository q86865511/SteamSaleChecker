import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import Database from 'better-sqlite3';
import { buildApp } from './server';
import { ensureAuthTables, type DB } from './db';
import { exchangeCode, fetchMe, addGuildMember } from './discord';

// 只 mock 對外網路呼叫;buildAuthorizeUrl 用真實版(才會把 state 帶進 redirect URL 供取出)。
vi.mock('./discord', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./discord')>();
  return {
    ...actual,
    exchangeCode: vi.fn(async () => 'tok'),
    fetchMe: vi.fn(async () => ({ id: 'duser', username: 'Bob', avatar: 'av1' })),
    addGuildMember: vi.fn(async () => {}),
  };
});

const fresh = (): DB => { const db = new Database(':memory:'); ensureAuthTables(db); return db; };
const sessionCookie = (res: LightMyRequestResponse): string | undefined => {
  const sc = res.headers['set-cookie'];
  const arr = Array.isArray(sc) ? sc : sc ? [sc] : [];
  return arr.map(String).find(c => c.startsWith('ssc_session='))?.split(';')[0];
};
// 走真實 /auth/discord 取得 (state, cookie),再打 callback —— 完整 CSRF-state 流程。
async function startLogin(app: Awaited<ReturnType<typeof buildApp>>) {
  const r = await app.inject({ method: 'GET', url: '/auth/discord' });
  const state = new URL(r.headers.location as string).searchParams.get('state')!;
  return { state, cookie: sessionCookie(r)! };
}

describe('auth / OAuth flow', () => {
  beforeEach(() => {
    process.env.DISCORD_CLIENT_ID = 'cid';
    process.env.DISCORD_REDIRECT_URI = 'http://localhost:8787/auth/callback';
    process.env.WEB_ORIGIN = 'http://localhost:4321';
    vi.mocked(exchangeCode).mockResolvedValue('tok');
    vi.mocked(fetchMe).mockResolvedValue({ id: 'duser', username: 'Bob', avatar: 'av1' });
    vi.mocked(addGuildMember).mockResolvedValue(undefined);
  });
  afterEach(() => {
    delete process.env.DISCORD_BOT_TOKEN;
    delete process.env.DISCORD_GUILD_ID;
    vi.clearAllMocks();
  });

  it('happy path:callback 換 token→建使用者→設 session→導回 web origin;/api/me 取回', async () => {
    const db = fresh();
    const app = await buildApp(db);
    const { state, cookie } = await startLogin(app);
    const cb = await app.inject({ method: 'GET', url: `/auth/callback?code=abc&state=${state}`, headers: { cookie } });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe('http://localhost:4321');
    expect(vi.mocked(exchangeCode)).toHaveBeenCalledOnce();
    // 使用者已持久化
    expect(db.prepare('SELECT username FROM users WHERE discord_id = ?').get('duser')).toMatchObject({ username: 'Bob' });
    // session 帶 userId → /api/me 回該使用者
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: sessionCookie(cb) ?? cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ username: 'Bob', avatar: 'av1' });
    await app.close();
  });

  it('state 不符 → 400、不換 token', async () => {
    const app = await buildApp(fresh());
    const { cookie } = await startLogin(app);
    const cb = await app.inject({ method: 'GET', url: '/auth/callback?code=abc&state=WRONG', headers: { cookie } });
    expect(cb.statusCode).toBe(400);
    expect(vi.mocked(exchangeCode)).not.toHaveBeenCalled();
    await app.close();
  });

  it('缺 code 或 state → 400', async () => {
    const app = await buildApp(fresh());
    const { state, cookie } = await startLogin(app);
    expect((await app.inject({ method: 'GET', url: `/auth/callback?state=${state}`, headers: { cookie } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/auth/callback?code=abc', headers: { cookie } })).statusCode).toBe(400);
    await app.close();
  });

  it('exchangeCode 失敗 → 502 oauth_failed', async () => {
    vi.mocked(exchangeCode).mockRejectedValueOnce(new Error('boom'));
    const app = await buildApp(fresh());
    const { state, cookie } = await startLogin(app);
    const cb = await app.inject({ method: 'GET', url: `/auth/callback?code=abc&state=${state}`, headers: { cookie } });
    expect(cb.statusCode).toBe(502);
    expect(cb.json()).toMatchObject({ error: 'oauth_failed' });
    await app.close();
  });

  it('addGuildMember 失敗為非致命:登入仍成功', async () => {
    process.env.DISCORD_BOT_TOKEN = 'bt';
    process.env.DISCORD_GUILD_ID = 'g1';
    vi.mocked(addGuildMember).mockRejectedValueOnce(new Error('cannot add'));
    const db = fresh();
    const app = await buildApp(db);
    const { state, cookie } = await startLogin(app);
    const cb = await app.inject({ method: 'GET', url: `/auth/callback?code=abc&state=${state}`, headers: { cookie } });
    expect(cb.statusCode).toBe(302);
    expect(vi.mocked(addGuildMember)).toHaveBeenCalledOnce();
    expect(db.prepare('SELECT 1 FROM users WHERE discord_id = ?').get('duser')).toBeDefined();
    await app.close();
  });

  it('/auth/discord 未設 client id → 500', async () => {
    delete process.env.DISCORD_CLIENT_ID;
    const app = await buildApp(fresh());
    expect((await app.inject({ method: 'GET', url: '/auth/discord' })).statusCode).toBe(500);
    await app.close();
  });

  it('/api/me:session 有 userId 但使用者已刪 → 401 not_found', async () => {
    const db = fresh();
    const app = await buildApp(db);
    const { state, cookie } = await startLogin(app);
    const cb = await app.inject({ method: 'GET', url: `/auth/callback?code=abc&state=${state}`, headers: { cookie } });
    const c2 = sessionCookie(cb) ?? cookie;
    db.prepare('DELETE FROM users WHERE discord_id = ?').run('duser');
    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: c2 } });
    expect(me.statusCode).toBe(401);
    expect(me.json()).toMatchObject({ error: 'not_found' });
    await app.close();
  });

  it('logout 清 session:之後 /api/me 為 401', async () => {
    const db = fresh();
    const app = await buildApp(db);
    const { state, cookie } = await startLogin(app);
    const cb = await app.inject({ method: 'GET', url: `/auth/callback?code=abc&state=${state}`, headers: { cookie } });
    const c2 = sessionCookie(cb) ?? cookie;
    const out = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie: c2 } });
    expect(out.statusCode).toBe(200);
    expect(out.json()).toEqual({ ok: true });
    const c3 = sessionCookie(out) ?? c2;
    expect((await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: c3 } })).statusCode).toBe(401);
    await app.close();
  });
});

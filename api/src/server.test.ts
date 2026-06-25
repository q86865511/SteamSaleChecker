import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { buildApp } from './server';
import { ensureAuthTables, upsertUser } from './db';

describe('api smoke', () => {
  it('/health → 200 {ok:true}; /api/me → 401', async () => {
    const db = new Database(':memory:');
    ensureAuthTables(db);
    const app = await buildApp(db);
    const h = await app.inject({ method: 'GET', url: '/health' });
    expect(h.statusCode).toBe(200);
    expect(h.json()).toEqual({ ok: true });
    const m = await app.inject({ method: 'GET', url: '/api/me' });
    expect(m.statusCode).toBe(401);
    await app.close();
  });

  it('wishlist routes require login (401)', async () => {
    const db = new Database(':memory:'); ensureAuthTables(db);
    const app = await buildApp(db);
    expect((await app.inject({ method:'GET', url:'/api/wishlist' })).statusCode).toBe(401);
    expect((await app.inject({ method:'POST', url:'/api/wishlist', payload:{ appid:1 } })).statusCode).toBe(401);
    expect((await app.inject({ method:'DELETE', url:'/api/wishlist/1' })).statusCode).toBe(401);
    expect((await app.inject({ method:'POST', url:'/api/wishlist/merge', payload:{ appids:[1] } })).statusCode).toBe(401);
    await app.close();
  });

  it('upsertUser 新增與更新同一 discord_id', async () => {
    const db = new Database(':memory:'); ensureAuthTables(db);
    const id1 = upsertUser(db, { id: 'd1', username: 'Alice', avatar: null });
    const id2 = upsertUser(db, { id: 'd1', username: 'Alice2', avatar: 'av' });
    expect(id1).toBe(id2);
    const row = db.prepare('SELECT username, avatar FROM users WHERE id = ?').get(id1) as any;
    expect(row.username).toBe('Alice2'); expect(row.avatar).toBe('av');
  });
  it('/auth/discord 未設定 client id → 500;設定後 → 302 到 Discord', async () => {
    const db = new Database(':memory:'); ensureAuthTables(db);
    delete process.env.DISCORD_CLIENT_ID;
    const app1 = await buildApp(db);
    expect((await app1.inject({ method:'GET', url:'/auth/discord' })).statusCode).toBe(500);
    await app1.close();
    process.env.DISCORD_CLIENT_ID = 'testclient';
    process.env.DISCORD_REDIRECT_URI = 'http://localhost:8787/auth/callback';
    const app2 = await buildApp(db);
    const r = await app2.inject({ method:'GET', url:'/auth/discord' });
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toContain('https://discord.com/api/oauth2/authorize');
    expect(r.headers.location).toContain('client_id=testclient');
    expect(r.headers.location).toContain('state=');
    await app2.close();
    delete process.env.DISCORD_CLIENT_ID;
  });
  it('/auth/callback state 不符 → 400;/auth/logout → 200', async () => {
    const db = new Database(':memory:'); ensureAuthTables(db);
    const app = await buildApp(db);
    expect((await app.inject({ method:'GET', url:'/auth/callback?code=x&state=y' })).statusCode).toBe(400);
    expect((await app.inject({ method:'POST', url:'/auth/logout' })).statusCode).toBe(200);
    await app.close();
  });
});

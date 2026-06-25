import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { buildApp } from './server';
import { ensureAuthTables } from './db';

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
});

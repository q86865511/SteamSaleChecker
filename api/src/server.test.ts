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
});

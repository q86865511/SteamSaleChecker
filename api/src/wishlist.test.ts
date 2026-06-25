import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { ensureAuthTables, addWish, removeWish, listWish, mergeWish } from './db';

function freshDb() { const db = new Database(':memory:'); ensureAuthTables(db); return db; }

describe('wishlist data layer', () => {
  it('add then list', () => {
    const db = freshDb();
    addWish(db, 1, 100, 1000);
    addWish(db, 1, 200, 1001);
    expect(listWish(db, 1).sort((a,b)=>a-b)).toEqual([100, 200]);
  });
  it('add is idempotent (dedup on user+appid)', () => {
    const db = freshDb();
    addWish(db, 1, 100, 1000);
    addWish(db, 1, 100, 2000);
    expect(listWish(db, 1)).toEqual([100]);
  });
  it('remove', () => {
    const db = freshDb();
    addWish(db, 1, 100, 1000);
    removeWish(db, 1, 100);
    expect(listWish(db, 1)).toEqual([]);
  });
  it('wishlists are per-user', () => {
    const db = freshDb();
    addWish(db, 1, 100, 1000);
    addWish(db, 2, 200, 1000);
    expect(listWish(db, 1)).toEqual([100]);
    expect(listWish(db, 2)).toEqual([200]);
  });
  it('merge bulk-adds and dedups against existing', () => {
    const db = freshDb();
    addWish(db, 1, 100, 1000);
    mergeWish(db, 1, [100, 200, 300], 2000);
    expect(listWish(db, 1).sort((a,b)=>a-b)).toEqual([100, 200, 300]);
  });
});

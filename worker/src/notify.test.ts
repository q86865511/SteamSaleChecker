import { describe, it, expect } from 'vitest';
import { openDb } from './db';
import { collectPending, shouldNotifyNewLow } from './notify';

describe('shouldNotifyNewLow', () => {
  const base = { dropEnabled: true, targetLowCents: null as number | null, genres: [] as string[], appGenres: ['動作'], lowCents: 5000 };
  it('drop 開、無目標、無類型限制 → drop', () => {
    expect(shouldNotifyNewLow(base)).toBe('drop');
  });
  it('drop 關、無目標 → null', () => {
    expect(shouldNotifyNewLow({ ...base, dropEnabled: false })).toBeNull();
  });
  it('目標價命中 → target', () => {
    expect(shouldNotifyNewLow({ ...base, targetLowCents: 5000 })).toBe('target');
    expect(shouldNotifyNewLow({ ...base, targetLowCents: 6000 })).toBe('target');
  });
  it('目標價未命中 → null(覆蓋 drop:設了目標就只看目標)', () => {
    expect(shouldNotifyNewLow({ ...base, targetLowCents: 4000, lowCents: 5000 })).toBeNull();
    expect(shouldNotifyNewLow({ ...base, dropEnabled: true, targetLowCents: 4000, lowCents: 5000 })).toBeNull();
  });
  it('類型白名單與遊戲類型無交集 → null(drop 與 target 皆受限)', () => {
    expect(shouldNotifyNewLow({ ...base, genres: ['策略'] })).toBeNull();
    expect(shouldNotifyNewLow({ ...base, genres: ['策略'], targetLowCents: 5000 })).toBeNull();
  });
  it('類型白名單有交集 → 照常判斷', () => {
    expect(shouldNotifyNewLow({ ...base, genres: ['動作', '策略'] })).toBe('drop');
    expect(shouldNotifyNewLow({ ...base, genres: ['動作'], targetLowCents: 5000 })).toBe('target');
  });
});

function seed() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO users(id,discord_id,username) VALUES(1,'d1','A'),(2,'d2','B')").run();
  db.prepare('INSERT INTO wishlist(user_id,appid,added_at) VALUES(1,10,1),(2,10,1),(1,20,1)').run();
  return db;
}
describe('collectPending', () => {
  it('對新低找出有收藏的使用者', () => {
    const db = seed();
    const p = collectPending(db, [{ appid: 10, name: 'X', lowCents: 5000 }]);
    expect(p.map(x => x.discordId).sort()).toEqual(['d1', 'd2']);
  });
  it('已通知同低點者排除', () => {
    const db = seed();
    db.prepare('INSERT INTO notifications(user_id,appid,notified_low_cents,notified_at) VALUES(1,10,5000,1)').run();
    const p = collectPending(db, [{ appid: 10, name: 'X', lowCents: 5000 }]);
    expect(p.map(x => x.discordId)).toEqual(['d2']);
  });
  it('沒人收藏的新低 → 空', () => {
    const db = seed();
    expect(collectPending(db, [{ appid: 999, name: 'Y', lowCents: 1 }])).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { openDb } from './db';
import { collectPending, shouldNotifyNewLow } from './notify';

describe('shouldNotifyNewLow', () => {
  const base = { dropEnabled: true, targetLowCents: null as number | null, genres: [] as string[], appGenres: ['動作'], lowCents: 5000, isNewLow: true };
  it('drop 開、是新低、無目標、無類型限制 → drop', () => {
    expect(shouldNotifyNewLow(base)).toBe('drop');
  });
  it('drop 開但非新低、無目標 → null(避免每輪洗頻)', () => {
    expect(shouldNotifyNewLow({ ...base, isNewLow: false })).toBeNull();
  });
  it('drop 關、無目標 → null', () => {
    expect(shouldNotifyNewLow({ ...base, dropEnabled: false })).toBeNull();
  });
  it('目標價命中 → target(即使不是新低,只要現價 ≤ 目標)', () => {
    expect(shouldNotifyNewLow({ ...base, targetLowCents: 5000 })).toBe('target');
    expect(shouldNotifyNewLow({ ...base, targetLowCents: 6000 })).toBe('target');
    // 關鍵修正:現價 ≤ 目標但「非新低」也要通知
    expect(shouldNotifyNewLow({ ...base, isNewLow: false, targetLowCents: 5000 })).toBe('target');
    expect(shouldNotifyNewLow({ ...base, isNewLow: false, dropEnabled: false, targetLowCents: 6000 })).toBe('target');
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
  const cand = (appid: number, lowCents: number, isNewLow = true) => ({ appid, name: 'X', lowCents, isNewLow });
  it('對新低找出有收藏的使用者', () => {
    const db = seed();
    const p = collectPending(db, [cand(10, 5000)]);
    expect(p.map(x => x.discordId).sort()).toEqual(['d1', 'd2']);
  });
  it('已通知同低點者排除', () => {
    const db = seed();
    db.prepare('INSERT INTO notifications(user_id,appid,notified_low_cents,notified_at) VALUES(1,10,5000,1)').run();
    const p = collectPending(db, [cand(10, 5000)]);
    expect(p.map(x => x.discordId)).toEqual(['d2']);
  });
  it('沒人收藏的新低 → 空', () => {
    const db = seed();
    expect(collectPending(db, [cand(999, 1)])).toEqual([]);
  });
  it('非新低時不發 drop(避免每輪洗頻)', () => {
    const db = seed();
    expect(collectPending(db, [cand(10, 5000, false)])).toEqual([]);
  });
  it('目標價:非新低但現價 ≤ 目標也通知(關鍵修正)', () => {
    const db = seed(); // user1 收藏 app10(無 discord? seed 有 d1/d2)
    db.prepare('UPDATE wishlist SET target_low_cents=10000 WHERE user_id=1 AND appid=10').run();
    const p = collectPending(db, [cand(10, 9000, false)]); // 非新低、9000 ≤ 10000
    expect(p.find(x => x.discordId === 'd1')?.reason).toBe('target');
    // user2 無目標、非新低 → 不發
    expect(p.find(x => x.discordId === 'd2')).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { openDb } from './db';
import { collectPending } from './notify';

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

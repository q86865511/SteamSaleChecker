import { describe, it, expect } from 'vitest';
import { openDb, recordPriceAndLow, getStats, getPriceHistory, getWishersForApp, alreadyNotified, markNotified } from './db';
describe('db', () => {
  it('建表並記錄價格、維護最低', () => {
    const db = openDb(':memory:');
    recordPriceAndLow(db, 1, 1000, 298_00, 80);
    recordPriceAndLow(db, 1, 2000, 400_00, 60);
    recordPriceAndLow(db, 1, 3000, 250_00, 83);
    const s = getStats(db, 1);
    expect(s?.observed_low_cents).toBe(250_00);
    expect(s?.observed_low_at).toBe(3000);
    expect(s?.observed_max_discount).toBe(83);
  });
  it('getPriceHistory 依時間回傳價格點', () => {
    const db = openDb(':memory:');
    recordPriceAndLow(db, 5, 1000, 500_00, 0);
    recordPriceAndLow(db, 5, 2000, 400_00, 20);
    expect(getPriceHistory(db, 5)).toEqual([{ t: 1000, price: 50000 }, { t: 2000, price: 40000 }]);
  });
  it('通知去重:markNotified 後同低點 alreadyNotified 為真,更低時為假', () => {
    const db = openDb(':memory:');
    expect(alreadyNotified(db, 1, 10, 50000)).toBe(false);
    markNotified(db, 1, 10, 50000, 1000);
    expect(alreadyNotified(db, 1, 10, 50000)).toBe(true);
    expect(alreadyNotified(db, 1, 10, 40000)).toBe(false);
  });
  it('getWishersForApp 回收藏該遊戲且有 discord_id 者', () => {
    const db = openDb(':memory:');
    db.prepare("INSERT INTO users(id,discord_id,username) VALUES(1,'d1','A')").run();
    db.prepare('INSERT INTO wishlist(user_id,appid,added_at) VALUES(1,10,1000)').run();
    expect(getWishersForApp(db, 10)).toEqual([{ userId: 1, discordId: 'd1' }]);
  });
});

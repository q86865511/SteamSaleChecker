import { describe, it, expect } from 'vitest';
import { openDb, recordPriceAndLow, getStats, getPriceHistory, getWishersForApp, alreadyNotified, markNotified,
  giveawayCount, recordGiveaway, pendingGiveaways, markGiveawayNotified, lastReportSent, recordReportSent } from './db';
import type { FreeGiveaway } from '@ssc/shared';

const gw = (id: string, over: Partial<FreeGiveaway> = {}): FreeGiveaway =>
  ({ id, source: 'gamerpower', title: 'G' + id, image: '', platforms: ['Steam'], endDate: null, url: 'u' + id, type: 'game', ...over });
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

describe('免費領取通知狀態', () => {
  it('首輪 seed(seedNotified=true)記錄但不待通知', () => {
    const db = openDb(':memory:');
    recordGiveaway(db, gw('a'), 1000, true);
    expect(giveawayCount(db)).toBe(1);
    expect(pendingGiveaways(db)).toHaveLength(0);
  });
  it('之後新 giveaway 進待通知,markNotified 後消失', () => {
    const db = openDb(':memory:');
    recordGiveaway(db, gw('a'), 1000, true);   // baseline
    recordGiveaway(db, gw('b', { worthUsd: '$5' }), 2000, false); // new
    const pend = pendingGiveaways(db);
    expect(pend.map(p => p.id)).toEqual(['b']);
    expect(pend[0].worth_usd).toBe('$5');
    markGiveawayNotified(db, 'b', 3000);
    expect(pendingGiveaways(db)).toHaveLength(0);
  });
  it('重複 id 不重複(upsert 更新 last_seen、保留 notified)', () => {
    const db = openDb(':memory:');
    recordGiveaway(db, gw('a'), 1000, false);
    recordGiveaway(db, gw('a'), 2000, false);
    expect(giveawayCount(db)).toBe(1);
    expect(pendingGiveaways(db)).toHaveLength(1);
  });
});

describe('report_gates', () => {
  it('未送過回 null;送過回最近時間(upsert)', () => {
    const db = openDb(':memory:');
    expect(lastReportSent(db, 'digest')).toBeNull();
    recordReportSent(db, 'digest', 5000);
    expect(lastReportSent(db, 'digest')).toBe(5000);
    recordReportSent(db, 'digest', 9000);
    expect(lastReportSent(db, 'digest')).toBe(9000);
  });
});

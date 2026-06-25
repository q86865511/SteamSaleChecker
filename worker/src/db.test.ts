import { describe, it, expect } from 'vitest';
import { openDb, recordPriceAndLow, getStats, getPriceHistory, getWishersForApp, alreadyNotified, markNotified,
  giveawayCount, recordGiveaway, pendingGiveaways, markGiveawayNotified, lastReportSent, recordReportSent,
  upsertReview, getReview, reviewedAt, markReviewChecked, upsertGame, gamesIndex,
  replaceGameGenres, getGenresForApp, allGenres, prunePriceHistory } from './db';
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
  it('getWishersForApp 回收藏該遊戲且有 discord_id 者(含目標價,未設為 null)', () => {
    const db = openDb(':memory:');
    db.prepare("INSERT INTO users(id,discord_id,username) VALUES(1,'d1','A')").run();
    db.prepare('INSERT INTO wishlist(user_id,appid,added_at) VALUES(1,10,1000)').run();
    expect(getWishersForApp(db, 10)).toEqual([{ userId: 1, discordId: 'd1', targetLowCents: null }]);
    db.prepare('UPDATE wishlist SET target_low_cents=20000 WHERE user_id=1 AND appid=10').run();
    expect(getWishersForApp(db, 10)[0].targetLowCents).toBe(20000);
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

describe('game_reviews', () => {
  it('upsert 後可讀回;再 upsert 更新;reviewedAt 反映時間', () => {
    const db = openDb(':memory:');
    expect(getReview(db, 10)).toBeUndefined();
    expect(reviewedAt(db, 10)).toBeNull();
    upsertReview(db, 10, { scoreDesc: '好評', positivePct: 88, total: 500 }, 1000);
    expect(getReview(db, 10)).toEqual({ scoreDesc: '好評', positivePct: 88, total: 500 });
    expect(reviewedAt(db, 10)).toBe(1000);
    upsertReview(db, 10, { scoreDesc: '極度好評', positivePct: 95, total: 800 }, 2000);
    expect(getReview(db, 10)?.positivePct).toBe(95);
    expect(reviewedAt(db, 10)).toBe(2000);
  });
  it('markReviewChecked 負快取:reviewedAt 有值但 getReview 仍 undefined', () => {
    const db = openDb(':memory:');
    markReviewChecked(db, 20, 1000);
    expect(reviewedAt(db, 20)).toBe(1000);
    expect(getReview(db, 20)).toBeUndefined();
  });
  it('既有評價後 markReviewChecked 不覆蓋評價,只更新時間', () => {
    const db = openDb(':memory:');
    upsertReview(db, 21, { scoreDesc: '好評', positivePct: 80, total: 100 }, 1000);
    markReviewChecked(db, 21, 5000);
    expect(getReview(db, 21)?.positivePct).toBe(80);
    expect(reviewedAt(db, 21)).toBe(5000);
  });
});

describe('prunePriceHistory(長存表清理)', () => {
  const now = 1000 * 86400;
  it('刪除早於保留天數的點、回刪除數;近期保留', () => {
    const db = openDb(':memory:');
    recordPriceAndLow(db, 1, now - 400 * 86400, 50000, 0); // 早於 365 天
    recordPriceAndLow(db, 1, now - 10 * 86400, 40000, 20); // 近期
    expect(prunePriceHistory(db, 365, now)).toBe(1);
    expect(getPriceHistory(db, 1).map(p => p.t)).toEqual([now - 10 * 86400]);
  });
  it('史低不受修剪影響(存於 game_stats)', () => {
    const db = openDb(':memory:');
    recordPriceAndLow(db, 1, now - 400 * 86400, 30000, 50); // 舊史低
    recordPriceAndLow(db, 1, now - 10 * 86400, 50000, 10);
    prunePriceHistory(db, 365, now);
    expect(getStats(db, 1)?.observed_low_cents).toBe(30000);
  });
});

describe('game_genres(類型)', () => {
  it('replaceGameGenres 寫入後 getGenresForApp 讀回', () => {
    const db = openDb(':memory:');
    replaceGameGenres(db, 10, ['動作', '角色扮演']);
    expect(getGenresForApp(db, 10).slice().sort()).toEqual(['動作', '角色扮演'].sort());
    expect(getGenresForApp(db, 99)).toEqual([]);
  });
  it('replace 覆寫(不殘留舊類型、不重複)', () => {
    const db = openDb(':memory:');
    replaceGameGenres(db, 10, ['動作', '策略']);
    replaceGameGenres(db, 10, ['動作']);
    expect(getGenresForApp(db, 10)).toEqual(['動作']);
  });
  it('allGenres 回全站去重類型', () => {
    const db = openDb(':memory:');
    replaceGameGenres(db, 1, ['動作', 'RPG']);
    replaceGameGenres(db, 2, ['RPG', '策略']);
    expect(new Set(allGenres(db))).toEqual(new Set(['動作', 'RPG', '策略']));
    expect(allGenres(db).length).toBe(3);
  });
});

describe('games 索引(收藏頁用)', () => {
  it('upsertGame 寫入/更新;gamesIndex 串 game_stats 史低(無則 null)', () => {
    const db = openDb(':memory:');
    upsertGame(db, 10, 'Game A', 'a.jpg', 200000, false, 1000);
    recordPriceAndLow(db, 10, 1000, 150000, 25); // 建立 game_stats 史低
    upsertGame(db, 11, 'Game B', 'b.jpg', 100000, false, 1000); // 無 game_stats
    const idx = gamesIndex(db);
    expect(idx.length).toBe(2);
    expect(idx.find(g => g.appid === 10)).toMatchObject({ nameZh: 'Game A', headerImage: 'a.jpg', observedLowCents: 150000 });
    expect(idx.find(g => g.appid === 11)).toMatchObject({ nameZh: 'Game B', observedLowCents: null });
    upsertGame(db, 10, 'Game A v2', 'a2.jpg', 200000, false, 2000);
    expect(gamesIndex(db).find(g => g.appid === 10)?.nameZh).toBe('Game A v2');
  });
});

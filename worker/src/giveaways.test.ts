import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openDb, recordGiveaway, getGiveawayAppid } from './db';
import type { FreeGiveaway } from '@ssc/shared';

vi.mock('./sources/steam', () => ({
  searchSteamAppid: vi.fn(),
  fetchAppDetails: vi.fn(),
  fetchReviewSummary: vi.fn(),
}));
import { searchSteamAppid, fetchAppDetails, fetchReviewSummary } from './sources/steam';
import { enrichGiveaway } from './giveaways';

const gw = (id: string, over: Partial<FreeGiveaway> = {}): FreeGiveaway =>
  ({ id, source: 'gamerpower', title: 'T' + id, image: '', platforms: ['Steam'], endDate: null, url: 'u' + id, type: 'game', ...over });
const app = { nameZh: 'X', isFree: false, headerImage: 'h.jpg', priceCents: 0, regularCents: 21600, discountPercent: 100, hasPrice: true };

beforeEach(() => vi.clearAllMocks());

describe('enrichGiveaway appid 快取 / 補強', () => {
  it('查詢失敗(throw)不快取 appid → 維持 NULL 下輪重試,本輪退精簡版(null)', async () => {
    const db = openDb(':memory:'); recordGiveaway(db, gw('a'), 1000, false);
    (searchSteamAppid as any).mockRejectedValue(new Error('throttled 429'));
    expect(await enrichGiveaway(db, { id: 'a', title: 'Ta', platforms: 'Steam' }, 1000)).toBeNull();
    expect(getGiveawayAppid(db, 'a')).toBeNull(); // 關鍵:未被毒化成 0
  });
  it('查無對應(null)快取 0,避免每輪重查', async () => {
    const db = openDb(':memory:'); recordGiveaway(db, gw('a'), 1000, false);
    (searchSteamAppid as any).mockResolvedValue(null);
    expect(await enrichGiveaway(db, { id: 'a', title: 'Ta', platforms: 'Steam' }, 1000)).toBeNull();
    expect(getGiveawayAppid(db, 'a')).toBe(0);
  });
  it('解析成功 → 補 appdetails/評價、快取 appid、回新形狀', async () => {
    const db = openDb(':memory:'); recordGiveaway(db, gw('a'), 1000, false);
    (searchSteamAppid as any).mockResolvedValue(123);
    (fetchAppDetails as any).mockResolvedValue(app);
    (fetchReviewSummary as any).mockResolvedValue({ scoreDesc: '好評', positivePct: 80, total: 100 });
    const r = await enrichGiveaway(db, { id: 'a', title: 'Ta', platforms: 'Steam' }, 1000);
    expect(r).toMatchObject({ appid: 123, regularCents: 21600, headerImage: 'h.jpg' });
    expect(r!.review!.positivePct).toBe(80);
    expect(getGiveawayAppid(db, 'a')).toBe(123);
  });
  it('appdetails 抓取失敗 → 退精簡版(null),不 throw', async () => {
    const db = openDb(':memory:'); recordGiveaway(db, gw('a'), 1000, false);
    (searchSteamAppid as any).mockResolvedValue(123);
    (fetchAppDetails as any).mockRejectedValue(new Error('HTTP 500'));
    expect(await enrichGiveaway(db, { id: 'a', title: 'Ta', platforms: 'Steam' }, 1000)).toBeNull();
  });
  it('非 Steam 直接 null,不查 Steam', async () => {
    const db = openDb(':memory:');
    expect(await enrichGiveaway(db, { id: 'x', title: 'X', platforms: 'Epic Games Store' }, 1000)).toBeNull();
    expect(searchSteamAppid).not.toHaveBeenCalled();
  });
  it('appCache 命中同 appid 時不重抓 appdetails(跨流程去重)', async () => {
    const db = openDb(':memory:'); recordGiveaway(db, gw('a'), 1000, false); recordGiveaway(db, gw('b'), 1000, false);
    (searchSteamAppid as any).mockResolvedValue(123);
    (fetchAppDetails as any).mockResolvedValue(app);
    (fetchReviewSummary as any).mockResolvedValue(null);
    const cache = new Map();
    await enrichGiveaway(db, { id: 'a', title: 'Ta', platforms: 'Steam' }, 1000, cache);
    await enrichGiveaway(db, { id: 'b', title: 'Tb', platforms: 'Steam' }, 1000, cache);
    expect((fetchAppDetails as any).mock.calls.length).toBe(1);
  });
});

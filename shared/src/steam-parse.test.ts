import { describe, it, expect } from 'vitest';
import { parseAppDetails, parseFeaturedItem, parseReviewSummary } from './steam-parse';
describe('steam-parse', () => {
  it('parseAppDetails:有價格', () => {
    const r = parseAppDetails({
      name: 'Stardew Valley', is_free: false, header_image: 'h.jpg',
      price_overview: { currency: 'TWD', initial: 39800, final: 29800, discount_percent: 25 },
    });
    expect(r).toEqual({ nameZh: 'Stardew Valley', isFree: false, headerImage: 'h.jpg',
      priceCents: 29800, regularCents: 39800, discountPercent: 25, hasPrice: true });
  });
  it('parseAppDetails:免費遊戲無 price_overview', () => {
    const r = parseAppDetails({ name: 'Dota 2', is_free: true, header_image: 'd.jpg' });
    expect(r.hasPrice).toBe(false);
    expect(r.priceCents).toBe(0);
  });
  it('parseAppDetails:解析介紹/類型/上市日/截圖(取前 6)', () => {
    const r = parseAppDetails({
      name: 'X', is_free: false, header_image: 'h',
      price_overview: { currency: 'TWD', initial: 1000, final: 500, discount_percent: 50 },
      short_description: '好玩的遊戲',
      genres: [{ description: '動作' }, { description: '冒險' }],
      release_date: { coming_soon: false, date: '2024 年 1 月 1 日' },
      screenshots: Array.from({ length: 8 }, (_, i) => ({ path_thumbnail: 's' + i })),
    });
    expect(r.shortDescription).toBe('好玩的遊戲');
    expect(r.genres).toEqual(['動作', '冒險']);
    expect(r.releaseDate).toBe('2024 年 1 月 1 日');
    expect(r.screenshots).toEqual(['s0', 's1', 's2', 's3', 's4', 's5']);
  });
  it('parseFeaturedItem:特價項目', () => {
    const r = parseFeaturedItem({
      id: 1091500, name: 'Cyberpunk 2077', discount_percent: 70,
      original_price: 159900, final_price: 47900, currency: 'TWD',
      header_image: 'c.jpg', large_capsule_image: 'cap.jpg', discount_expiration: 1750000000,
    });
    expect(r).toEqual({ appid: 1091500, name: 'Cyberpunk 2077', discountPercent: 70,
      regularCents: 159900, priceCents: 47900, headerImage: 'cap.jpg', discountExpiration: 1750000000 });
  });
  it('parseReviewSummary:正評率四捨五入', () => {
    expect(parseReviewSummary({ success: 1, query_summary: { review_score_desc: '壓倒性好評', total_positive: 950, total_reviews: 1000 } }))
      .toEqual({ scoreDesc: '壓倒性好評', positivePct: 95, total: 1000 });
  });
  it('parseReviewSummary:success 非 1 回 null', () => {
    expect(parseReviewSummary({ success: 0 })).toBeNull();
  });
  it('parseReviewSummary:缺 query_summary 回 null', () => {
    expect(parseReviewSummary({ success: 1 })).toBeNull();
  });
  it('parseReviewSummary:0 則評論不除以零', () => {
    expect(parseReviewSummary({ success: 1, query_summary: { review_score_desc: '無評論', total_positive: 0, total_reviews: 0 } }))
      .toEqual({ scoreDesc: '無評論', positivePct: 0, total: 0 });
  });
});

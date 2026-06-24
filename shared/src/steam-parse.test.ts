import { describe, it, expect } from 'vitest';
import { parseAppDetails, parseFeaturedItem } from './steam-parse';
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
  it('parseFeaturedItem:特價項目', () => {
    const r = parseFeaturedItem({
      id: 1091500, name: 'Cyberpunk 2077', discount_percent: 70,
      original_price: 159900, final_price: 47900, currency: 'TWD',
      header_image: 'c.jpg', large_capsule_image: 'cap.jpg', discount_expiration: 1750000000,
    });
    expect(r).toEqual({ appid: 1091500, name: 'Cyberpunk 2077', discountPercent: 70,
      regularCents: 159900, priceCents: 47900, headerImage: 'cap.jpg', discountExpiration: 1750000000 });
  });
});

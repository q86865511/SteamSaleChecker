import { describe, it, expect } from 'vitest';
import { extractSteamId64, parseWishlistAppids } from './steam-wishlist';

describe('extractSteamId64', () => {
  it('純 17 碼 SteamID64', () => {
    expect(extractSteamId64('76561197960434622')).toBe('76561197960434622');
    expect(extractSteamId64('  76561197960434622 ')).toBe('76561197960434622');
  });
  it('/profiles/<id> 個人檔網址', () => {
    expect(extractSteamId64('https://steamcommunity.com/profiles/76561197960434622/')).toBe('76561197960434622');
    expect(extractSteamId64('steamcommunity.com/profiles/76561197960434622')).toBe('76561197960434622');
  });
  it('vanity /id/<name> 無法解析回 null', () => {
    expect(extractSteamId64('https://steamcommunity.com/id/gabelogannewell/')).toBeNull();
  });
  it('亂字串回 null', () => {
    expect(extractSteamId64('garbage')).toBeNull();
    expect(extractSteamId64('12345')).toBeNull();
  });
});

describe('parseWishlistAppids', () => {
  it('從 response.items 取 appid', () => {
    expect(parseWishlistAppids({ response: { items: [{ appid: 1, priority: 1 }, { appid: 2, date_added: 9 }] } })).toEqual([1, 2]);
  });
  it('空/缺結構回空陣列', () => {
    expect(parseWishlistAppids({})).toEqual([]);
    expect(parseWishlistAppids({ response: { items: [] } })).toEqual([]);
    expect(parseWishlistAppids(null)).toEqual([]);
  });
  it('過濾非整數 appid', () => {
    expect(parseWishlistAppids({ response: { items: [{ appid: 5 }, { appid: 'x' }, { priority: 1 }] } })).toEqual([5]);
  });
});

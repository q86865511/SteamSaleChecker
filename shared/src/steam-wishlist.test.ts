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
  it('過長數字串/嵌入子字串不誤判(錨定)', () => {
    expect(extractSteamId64('176561197960434622')).toBeNull();        // 18 碼
    expect(extractSteamId64('999976561197960434622999')).toBeNull();  // 嵌入更長數字串
  });
  it('/id/<17碼數字 vanity 名> 仍回 null(非 /profiles/)', () => {
    expect(extractSteamId64('https://steamcommunity.com/id/76561197960434622/')).toBeNull();
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
  it('過濾 0 與負數 appid', () => {
    expect(parseWishlistAppids({ response: { items: [{ appid: 5 }, { appid: 0 }, { appid: -1 }] } })).toEqual([5]);
  });
});

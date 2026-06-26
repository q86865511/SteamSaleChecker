import { describe, it, expect, afterEach } from 'vitest';
import { searchSteamAppid } from './steam';

const orig = globalThis.fetch;
afterEach(() => { globalThis.fetch = orig; });
const mockItems = (items: any[], ok = true) => {
  (globalThis as any).fetch = async () => ({ ok, status: ok ? 200 : 500, json: async () => ({ total: items.length, items }) });
};

describe('searchSteamAppid', () => {
  it('標題正規化相等時回該 appid', async () => {
    mockItems([{ id: 871550, name: 'The Red Lantern' }]);
    expect(await searchSteamAppid('The Red Lantern')).toBe(871550);
  });
  it('忽略大小寫與 ™®/標點差異', async () => {
    mockItems([{ id: 359550, name: 'Tom Clancy’s Rainbow Six® Siege' }]);
    expect(await searchSteamAppid("Tom Clancy's Rainbow Six Siege")).toBe(359550);
  });
  it('掃描多個候選,取正規化相等者', async () => {
    mockItems([{ id: 1, name: 'The Red Lantern Soundtrack' }, { id: 871550, name: 'The Red Lantern' }]);
    expect(await searchSteamAppid('The Red Lantern')).toBe(871550);
  });
  it('沒有夠吻合的就回 null(寧可退精簡版也不錯配)', async () => {
    mockItems([{ id: 2, name: 'Completely Different Game' }]);
    expect(await searchSteamAppid('The Red Lantern')).toBeNull();
  });
  it('空結果回 null', async () => {
    mockItems([]);
    expect(await searchSteamAppid('Whatever')).toBeNull();
  });
  it('抓取失敗會 throw(讓上層分辨「查詢失敗」與「查無對應」)', async () => {
    mockItems([], false);
    await expect(searchSteamAppid('The Red Lantern')).rejects.toThrow();
  });
});

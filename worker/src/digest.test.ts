import { describe, it, expect } from 'vitest';
import { filterDealsByGenres } from './digest';

describe('filterDealsByGenres', () => {
  const deals = [{ appid: 1 }, { appid: 2 }, { appid: 3 }];
  const g = new Map<number, string[]>([[1, ['動作', 'RPG']], [2, ['策略']], [3, []]]);
  it('空白名單回全部(不限)', () => expect(filterDealsByGenres(deals, [], g)).toHaveLength(3));
  it('依白名單交集過濾', () => expect(filterDealsByGenres(deals, ['動作'], g).map(d => d.appid)).toEqual([1]));
  it('無類型資料的 deal 在有白名單時被排除', () => expect(filterDealsByGenres(deals, ['策略'], g).map(d => d.appid)).toEqual([2]));
});

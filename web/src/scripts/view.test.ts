import { describe, it, expect } from 'vitest';
import {
  filterDeals, sortDeals, applyView, resolveTheme, nextSortDir, fmtLowDate, readChartPalette,
  type Deal, type ViewState,
} from './view';

const mk = (o: Partial<Deal>): Deal => ({
  appid: 1, nameZh: 'X', headerImage: '', priceCents: 1000, regularCents: 2000,
  discountPercent: 50, rank: 0, observedLowCents: 1000, observedLowAt: 0,
  isAtObservedLow: true, observedMaxDiscount: 50, ...o,
});

describe('filterDeals', () => {
  const ds = [mk({ appid: 1, nameZh: 'Cyberpunk 2077' }), mk({ appid: 2, nameZh: '潛水員戴夫' })];
  it('空字串回傳原陣列(不過濾)', () => expect(filterDeals(ds, '')).toHaveLength(2));
  it('英文子字串不分大小寫', () => expect(filterDeals(ds, 'CYBER')[0].appid).toBe(1));
  it('中文子字串可命中', () => expect(filterDeals(ds, '戴夫')[0].appid).toBe(2));
  it('無命中回傳空陣列', () => expect(filterDeals(ds, 'zzz')).toHaveLength(0));
  it('前後空白會被 trim', () => expect(filterDeals(ds, '  cyber ')).toHaveLength(1));
});

describe('sortDeals', () => {
  const ds = [
    mk({ rank: 0, discountPercent: 10, priceCents: 300 }),
    mk({ rank: 1, discountPercent: 90, priceCents: 100 }),
    mk({ rank: 2, discountPercent: 90, priceCents: 200 }),
  ];
  it('折扣 desc 由高到低', () =>
    expect(sortDeals(ds, 'discount', 'desc').map(d => d.discountPercent)).toEqual([90, 90, 10]));
  it('折扣相同時以 rank 穩定排序', () =>
    expect(sortDeals(ds, 'discount', 'desc').slice(0, 2).map(d => d.rank)).toEqual([1, 2]));
  it('價格 asc 由低到高', () =>
    expect(sortDeals(ds, 'price', 'asc').map(d => d.priceCents)).toEqual([100, 200, 300]));
  it('rank asc 為推薦原始順序', () =>
    expect(sortDeals(ds, 'rank', 'asc').map(d => d.rank)).toEqual([0, 1, 2]));
  it('不可變更原陣列', () => {
    const before = ds.map(d => d.rank);
    sortDeals(ds, 'price', 'asc');
    expect(ds.map(d => d.rank)).toEqual(before);
  });
  it('observedLowCents 為 null 時排在最後(low asc)', () => {
    const x = [mk({ rank: 0, observedLowCents: null }), mk({ rank: 1, observedLowCents: 500 })];
    expect(sortDeals(x, 'low', 'asc')[0].rank).toBe(1);
  });
});

describe('applyView 組合 filter+sort', () => {
  const ds = [mk({ appid: 1, nameZh: 'A', discountPercent: 10 }), mk({ appid: 2, nameZh: 'AB', discountPercent: 90 })];
  it('先過濾再排序', () => {
    const s: ViewState = { searchQuery: 'a', sortKey: 'discount', sortDir: 'desc', viewMode: 'list' };
    const out = applyView(ds, s);
    expect(out.map(d => d.appid)).toEqual([2, 1]);
  });
});

describe('resolveTheme', () => {
  it('localStorage 明確值優先', () => expect(resolveTheme('light', true)).toBe('light'));
  it('無值時跟隨系統(深色)', () => expect(resolveTheme(null, true)).toBe('dark'));
  it('無值時跟隨系統(淺色)', () => expect(resolveTheme(null, false)).toBe('light'));
  it('非法值回退到系統偏好', () => expect(resolveTheme('purple', true)).toBe('dark'));
});

describe('nextSortDir', () => {
  it('點新欄位(折扣)預設 desc', () => expect(nextSortDir('rank', 'discount', 'asc')).toBe('desc'));
  it('點新欄位(rank)預設 asc', () => expect(nextSortDir('discount', 'rank', 'desc')).toBe('asc'));
  it('點同欄位翻轉方向', () => expect(nextSortDir('price', 'price', 'asc')).toBe('desc'));
});

describe('fmtLowDate', () => {
  it('null 顯示破折號', () => expect(fmtLowDate(null)).toBe('—'));
  it('unix 秒格式化為 YYYY/MM/DD(UTC)', () =>
    expect(fmtLowDate(Math.floor(Date.parse('2024-12-19T12:00:00Z') / 1000))).toBe('2024/12/19'));
});

describe('readChartPalette', () => {
  it('讀得到變數時使用該值', () =>
    expect(readChartPalette(n => ({ '--accent': '#abc' } as Record<string, string>)[n] ?? '').line).toBe('#abc'));
  it('變數為空時回退預設色', () => expect(readChartPalette(() => '').line).toBe('#66c0f4'));
});

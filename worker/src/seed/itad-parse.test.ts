import { describe, it, expect } from 'vitest';
import { parseStoreLows } from './itad-parse';

// 仿 ITAD games/storelow/v2 回應形狀
const entry = (id: string, amount: number, currency = 'TWD', amountInt?: number, timestamp?: string) => ({
  id,
  lows: [{ shop: { id: 61, name: 'Steam' }, price: { amount, amountInt, currency }, cut: 50, timestamp }],
});

describe('parseStoreLows', () => {
  it('解析單筆 TWD 史低,回傳 cents、currency 與 lowAt', () => {
    const m = parseStoreLows([entry('g1', 479, 'TWD', 47900)]);
    expect(m.get('g1')).toEqual({ cents: 47900, currency: 'TWD', lowAt: null });
  });

  it('有 amountInt 時直接採用(避免浮點誤差)', () => {
    const m = parseStoreLows([entry('g1', 479, 'TWD', 47900)]);
    expect(m.get('g1')?.cents).toBe(47900);
  });

  it('無 amountInt 時以 amount 元轉 cents(四捨五入)', () => {
    const m = parseStoreLows([entry('g1', 12.345, 'TWD')]);
    expect(m.get('g1')?.cents).toBe(1235);
  });

  it('解析 ISO timestamp 為 unix 秒', () => {
    const ts = '2024-12-19T21:53:34+01:00';
    const m = parseStoreLows([entry('g1', 133, 'TWD', 13300, ts)]);
    expect(m.get('g1')?.lowAt).toBe(Math.floor(Date.parse(ts) / 1000));
  });

  it('缺 timestamp 時 lowAt 為 null', () => {
    const m = parseStoreLows([entry('g1', 133, 'TWD', 13300)]);
    expect(m.get('g1')?.lowAt).toBeNull();
  });

  it('非法 timestamp 時 lowAt 為 null', () => {
    const m = parseStoreLows([entry('g1', 133, 'TWD', 13300, 'not-a-date')]);
    expect(m.get('g1')?.lowAt).toBeNull();
  });

  it('保留非 TWD 幣別(供上層警示)', () => {
    const m = parseStoreLows([entry('g1', 15.99, 'USD')]);
    expect(m.get('g1')).toEqual({ cents: 1599, currency: 'USD', lowAt: null });
  });

  it('多筆條目都解析', () => {
    const m = parseStoreLows([entry('g1', 100, 'TWD', 10000), entry('g2', 200, 'TWD', 20000)]);
    expect(m.size).toBe(2);
    expect(m.get('g2')?.cents).toBe(20000);
  });

  it('lows 為空陣列的條目略過', () => {
    const m = parseStoreLows([{ id: 'g1', lows: [] }]);
    expect(m.has('g1')).toBe(false);
  });

  it('缺 price 金額(amount 與 amountInt 皆無)的條目略過', () => {
    const m = parseStoreLows([{ id: 'g1', lows: [{ price: { currency: 'TWD' } }] }]);
    expect(m.has('g1')).toBe(false);
  });

  it('缺 id 的條目略過', () => {
    const m = parseStoreLows([{ lows: [{ price: { amount: 100, currency: 'TWD' } }] }]);
    expect(m.size).toBe(0);
  });

  it('非陣列輸入回傳空 Map', () => {
    expect(parseStoreLows(null).size).toBe(0);
    expect(parseStoreLows(undefined).size).toBe(0);
    expect(parseStoreLows({} as unknown).size).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { centsToTwd, formatTwd, discountPercent } from './price';
describe('price', () => {
  it('centsToTwd 把分轉成元', () => { expect(centsToTwd(39800)).toBe(398); });
  it('formatTwd 顯示千分位、無小數', () => {
    expect(formatTwd(159900)).toBe('NT$ 1,599');
    expect(formatTwd(0)).toBe('NT$ 0');
  });
  it('discountPercent 由原價/現價算折扣%', () => {
    expect(discountPercent(1490_00, 298_00)).toBe(80);
    expect(discountPercent(0, 0)).toBe(0);
  });
});

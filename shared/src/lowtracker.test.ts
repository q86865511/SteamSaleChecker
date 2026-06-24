import { describe, it, expect } from 'vitest';
import { evaluateLow, isAtLow } from './lowtracker';
describe('lowtracker', () => {
  it('沒有歷史時,當前價即為新低', () => {
    expect(evaluateLow(298_00, null)).toEqual({ isNewLow: true, lowCents: 298_00 });
  });
  it('比歷史低 → 創新低並更新', () => {
    expect(evaluateLow(250_00, 298_00)).toEqual({ isNewLow: true, lowCents: 250_00 });
  });
  it('未低於歷史 → 不創新低,沿用舊低', () => {
    expect(evaluateLow(400_00, 298_00)).toEqual({ isNewLow: false, lowCents: 298_00 });
  });
  it('isAtLow:當前 <= 史低 視為處於史低', () => {
    expect(isAtLow(298_00, 298_00)).toBe(true);
    expect(isAtLow(310_00, 298_00)).toBe(false);
    expect(isAtLow(310_00, null)).toBe(false);
  });
});

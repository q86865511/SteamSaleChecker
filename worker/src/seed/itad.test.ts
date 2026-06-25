import { describe, it, expect } from 'vitest';
import { shouldRefresh } from './itad';

describe('shouldRefresh', () => {
  const DAY = 24 * 3600;
  const t0 = 1_000_000;

  it('從未 seed(null)時要刷新', () => {
    expect(shouldRefresh(null, t0, DAY)).toBe(true);
  });
  it('距上次未滿間隔時跳過', () => {
    expect(shouldRefresh(t0, t0 + DAY - 1, DAY)).toBe(false);
  });
  it('距上次剛好達到間隔時刷新', () => {
    expect(shouldRefresh(t0, t0 + DAY, DAY)).toBe(true);
  });
  it('距上次超過間隔時刷新', () => {
    expect(shouldRefresh(t0, t0 + DAY * 3, DAY)).toBe(true);
  });
  it('間隔為 0 時總是刷新', () => {
    expect(shouldRefresh(t0, t0, 0)).toBe(true);
  });
});

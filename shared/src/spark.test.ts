import { describe, it, expect } from 'vitest';
import { downsampleSpark } from './spark';

describe('downsampleSpark', () => {
  it('n <= 0 回空陣列', () => {
    expect(downsampleSpark([1, 2, 3], 0)).toEqual([]);
    expect(downsampleSpark([1, 2, 3], -1)).toEqual([]);
  });
  it('點數 <= n 時原樣回傳(複製,不變更原陣列)', () => {
    const src = [10, 20];
    const out = downsampleSpark(src, 5);
    expect(out).toEqual([10, 20]);
    expect(out).not.toBe(src);
  });
  it('點數等於 n 時原樣回傳', () => {
    expect(downsampleSpark([1, 2, 3, 4, 5], 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it('點數多於 n 時均勻取樣、保留頭尾', () => {
    const out = downsampleSpark([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5);
    expect(out).toEqual([0, 2, 5, 7, 9]);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(9);
  });
  it('空陣列回空陣列', () => {
    expect(downsampleSpark([], 5)).toEqual([]);
  });
});

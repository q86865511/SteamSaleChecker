import { describe, it, expect } from 'vitest';
import { openDb, recordPriceAndLow, getStats } from './db';
describe('db', () => {
  it('建表並記錄價格、維護最低', () => {
    const db = openDb(':memory:');
    recordPriceAndLow(db, 1, 1000, 298_00, 80);
    recordPriceAndLow(db, 1, 2000, 400_00, 60);
    recordPriceAndLow(db, 1, 3000, 250_00, 83);
    const s = getStats(db, 1);
    expect(s?.observed_low_cents).toBe(250_00);
    expect(s?.observed_low_at).toBe(3000);
    expect(s?.observed_max_discount).toBe(83);
  });
});

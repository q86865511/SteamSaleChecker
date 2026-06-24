import { describe, it, expect, afterEach } from 'vitest';
import { writeJsonAtomic } from './bake';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const f = join(tmpdir(), 'ssc-bake-test.json');
afterEach(() => { if (existsSync(f)) rmSync(f); });
describe('bake', () => {
  it('原子寫入並可讀回', () => {
    writeJsonAtomic(f, { a: 1 });
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ a: 1 });
  });
  it('覆寫後是新內容、無殘留 .tmp', () => {
    writeJsonAtomic(f, { a: 1 });
    writeJsonAtomic(f, { a: 2 });
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ a: 2 });
    expect(existsSync(f + '.tmp')).toBe(false);
  });
});

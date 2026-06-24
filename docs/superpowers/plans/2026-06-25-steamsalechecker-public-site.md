# SteamSaleChecker 公開站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出一個能上線的 Steam 特價公開站:後端定時抓 Steam 官方端點 + GamerPower、自建價格歷史並算「本站追蹤以來最低」、烤成靜態 JSON,前端用 Astro 呈現熱門特價榜、即將結束區與免費領取區。

**Architecture:** npm workspaces monorepo,分 `shared`(純函式 + 型別,TDD 重點)、`worker`(抓取 + SQLite + 烤 JSON,由 cron 觸發)、`web`(Astro 靜態站讀 `/data/*.json`)。所有第三方呼叫都在 server-side;公開瀏覽永遠是靜態 JSON。Discord 帳號/通知不在本計畫,屬後續子系統。

**Tech Stack:** Node 20+ / TypeScript、better-sqlite3、vitest、tsx、Astro、uPlot(價格圖)。production 不依賴 ITAD(僅一次性 seed 腳本用)。

**本計畫對應設計階段:** P0(骨架 + 資料源驗證)、P1(抓取管線 + SQLite + 史低 + seed)、P2(公開前端)。

---

## File Structure(先鎖定責任邊界)

```
package.json                 # workspaces: ["shared","worker","web"]
tsconfig.base.json
vitest.config.ts
.gitignore
shared/
  package.json
  src/types.ts               # 跨層共用型別(Deal / FreeGiveaway / Meta)
  src/price.ts               # 幣別/折扣純函式
  src/lowtracker.ts          # 是否創新低 純函式
  src/gamerpower-parse.ts    # GamerPower raw → FreeGiveaway
  src/steam-parse.ts         # appdetails / featuredcategories → 正規化
worker/
  package.json
  src/db.ts                  # SQLite schema + 讀寫
  src/sources/steam.ts       # featuredcategories / search / appdetails(節流+退避)
  src/sources/gamerpower.ts  # giveaways 抓取 + 過濾
  src/bake.ts                # 原子寫 JSON(temp+rename)
  src/pipeline.ts            # 探索→補資料→寫史→更新最低→組 Deal/Free
  src/index.ts               # CLI 進入點(cron 呼叫)
  src/seed/itad-seed.ts      # 一次性史低匯入(用後即棄,不進 production 流程)
  scripts/verify-sources.ts  # P0 實測:印出各端點關鍵欄位
web/                         # Astro(astro create 產生後改造)
  src/layouts/Base.astro
  src/pages/index.astro
  src/components/{DealCard,DealList,EndingSoon,FreeCard,PriceChart,FreshnessBadge,LangToggle}.astro|ts
  src/i18n/{zh-TW.json,en.json}
  public/data/{deals.json,free.json,meta.json}   # worker 覆寫(實際部署由 worker 寫入被服務目錄)
data/steam.db                # .gitignore
```

---

## Task 0:Monorepo 骨架與工具

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`
- Create: `shared/package.json`, `shared/tsconfig.json`
- Create: `worker/package.json`, `worker/tsconfig.json`

- [ ] **Step 1:`git init` 與建立根 `package.json`**

```bash
git init
```

`package.json`:
```json
{
  "name": "steamsalechecker",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "worker", "web"],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "tsx": "^4.16.0",
    "@types/node": "^20.14.0"
  }
}
```

- [ ] **Step 2:建立 `tsconfig.base.json`、`vitest.config.ts`、`.gitignore`**

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist"
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['**/*.test.ts'] } });
```

`.gitignore`:
```
node_modules/
dist/
data/
web/dist/
.env
*.log
```

- [ ] **Step 3:建立 `shared` 與 `worker` 子套件 package.json / tsconfig**

`shared/package.json`:
```json
{
  "name": "@ssc/shared",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```
`shared/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src"] }
```
`worker/package.json`:
```json
{
  "name": "@ssc/worker",
  "version": "0.0.0",
  "type": "module",
  "dependencies": { "better-sqlite3": "^11.0.0", "@ssc/shared": "*" },
  "devDependencies": { "@types/better-sqlite3": "^7.6.0" },
  "scripts": {
    "run": "tsx src/index.ts",
    "verify": "tsx scripts/verify-sources.ts",
    "seed": "tsx src/seed/itad-seed.ts"
  }
}
```
`worker/tsconfig.json`:
```json
{ "extends": "../tsconfig.base.json", "include": ["src", "scripts"] }
```

- [ ] **Step 4:安裝相依**

Run: `npm install`
Expected: 安裝成功;`node_modules` 出現;`better-sqlite3` 完成原生編譯。

- [ ] **Step 5:Commit**

```bash
git add -A
git commit -m "骨架: 建立 monorepo 與工具鏈"
```

---

## Task 1:共用型別

**Files:**
- Create: `shared/src/types.ts`
- Create: `shared/src/index.ts`

- [ ] **Step 1:寫 `shared/src/types.ts`**

```ts
export interface Deal {
  appid: number;
  nameZh: string;
  nameEn?: string;
  headerImage: string;
  priceCents: number;
  regularCents: number;
  discountPercent: number;
  rank: number;                 // 熱銷排序(越小越前)
  discountExpiration?: number;  // unix 秒
  observedLowCents: number | null;
  observedLowAt: number | null;
  isAtObservedLow: boolean;
  observedMaxDiscount: number;
}

export interface FreeGiveaway {
  id: string;
  source: 'gamerpower';
  title: string;
  worthUsd?: string;
  image: string;
  platforms: string[];
  endDate: string | null;       // null = 無期限(永久)
  url: string;
  type: string;                 // Game / DLC
}

export interface Meta {
  generatedAt: number;          // unix 秒
  trackingSince: number;        // unix 秒
  dealCount: number;
  freeCount: number;
  ok: boolean;                  // 本次抓取是否成功(失敗則前端標示為舊資料)
}
```

- [ ] **Step 2:寫 `shared/src/index.ts`(barrel)**

```ts
export * from './types';
export * from './price';
export * from './lowtracker';
export * from './gamerpower-parse';
export * from './steam-parse';
```

(此時後面四個檔尚未建立會報錯——下一步先補空匯出,或在各自 Task 完成後再驗證 build;暫時可只 `export * from './types';`,各 Task 完成時再補回。)

- [ ] **Step 3:Commit**

```bash
git add shared/src/types.ts shared/src/index.ts
git commit -m "功能: 定義共用型別 Deal/FreeGiveaway/Meta"
```

---

## Task 2:幣別與折扣純函式(TDD)

**Files:**
- Test: `shared/src/price.test.ts`
- Create: `shared/src/price.ts`

- [ ] **Step 1:寫失敗測試 `shared/src/price.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { centsToTwd, formatTwd, discountPercent } from './price';

describe('price', () => {
  it('centsToTwd 把分轉成元', () => {
    expect(centsToTwd(39800)).toBe(398);
  });
  it('formatTwd 顯示千分位、無小數', () => {
    expect(formatTwd(159900)).toBe('NT$ 1,599');
    expect(formatTwd(0)).toBe('NT$ 0');
  });
  it('discountPercent 由原價/現價算折扣%', () => {
    expect(discountPercent(1490_00, 298_00)).toBe(80);
    expect(discountPercent(0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2:跑測試確認失敗**

Run: `npx vitest run shared/src/price.test.ts`
Expected: FAIL（找不到模組 `./price`）

- [ ] **Step 3:寫最小實作 `shared/src/price.ts`**

```ts
export const centsToTwd = (cents: number): number => Math.round(cents) / 100;

export const formatTwd = (cents: number): string =>
  `NT$ ${Math.round(centsToTwd(cents)).toLocaleString('en-US')}`;

export const discountPercent = (regularCents: number, finalCents: number): number =>
  regularCents <= 0 ? 0 : Math.round((1 - finalCents / regularCents) * 100);
```

- [ ] **Step 4:跑測試確認通過**

Run: `npx vitest run shared/src/price.test.ts`
Expected: PASS（3 passed）

- [ ] **Step 5:Commit**

```bash
git add shared/src/price.ts shared/src/price.test.ts
git commit -m "功能: 幣別與折扣純函式(含測試)"
```

---

## Task 3:「是否創新低」純函式(TDD)

**Files:**
- Test: `shared/src/lowtracker.test.ts`
- Create: `shared/src/lowtracker.ts`

- [ ] **Step 1:寫失敗測試**

```ts
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
```

- [ ] **Step 2:跑測試確認失敗**

Run: `npx vitest run shared/src/lowtracker.test.ts`
Expected: FAIL

- [ ] **Step 3:寫最小實作 `shared/src/lowtracker.ts`**

```ts
export interface LowResult { isNewLow: boolean; lowCents: number; }

export const evaluateLow = (currentCents: number, prevLowCents: number | null): LowResult =>
  prevLowCents === null || currentCents < prevLowCents
    ? { isNewLow: true, lowCents: currentCents }
    : { isNewLow: false, lowCents: prevLowCents };

export const isAtLow = (currentCents: number, lowCents: number | null): boolean =>
  lowCents !== null && currentCents <= lowCents;
```

- [ ] **Step 4:跑測試確認通過**

Run: `npx vitest run shared/src/lowtracker.test.ts`
Expected: PASS（4 passed）

- [ ] **Step 5:Commit**

```bash
git add shared/src/lowtracker.ts shared/src/lowtracker.test.ts
git commit -m "功能: 創新低判斷純函式(含測試)"
```

---

## Task 4:GamerPower 解析(TDD)

**Files:**
- Test: `shared/src/gamerpower-parse.test.ts`
- Create: `shared/src/gamerpower-parse.ts`

- [ ] **Step 1:寫失敗測試(含 fixture)**

```ts
import { describe, it, expect } from 'vitest';
import { parsePlatforms, toFreeGiveaway, keepForeverGame, RawGiveaway } from './gamerpower-parse';

const perpetual: RawGiveaway = {
  id: 2840, title: 'Fallout 76', worth: '$39.99', image: 'http://img/f76.jpg', thumbnail: '',
  open_giveaway_url: 'http://gp/2840', type: 'Game', platforms: 'PC, Epic Games Store',
  end_date: 'N/A', status: 'Active',
};
const dlc: RawGiveaway = { ...perpetual, id: 999, type: 'DLC', end_date: '2026-07-01 23:59:59' };
const beta: RawGiveaway = { ...perpetual, id: 12, type: 'Beta' };

describe('gamerpower-parse', () => {
  it('platforms 逗號字串切成陣列', () => {
    expect(parsePlatforms('PC, Steam, Epic Games Store')).toEqual(['PC', 'Steam', 'Epic Games Store']);
  });
  it('toFreeGiveaway 正規化、N/A 期限轉 null', () => {
    expect(toFreeGiveaway(perpetual)).toEqual({
      id: '2840', source: 'gamerpower', title: 'Fallout 76', worthUsd: '$39.99',
      image: 'http://img/f76.jpg', platforms: ['PC', 'Epic Games Store'],
      endDate: null, url: 'http://gp/2840', type: 'Game',
    });
  });
  it('有期限的領取 endDate 保留', () => {
    expect(toFreeGiveaway(dlc).endDate).toBe('2026-07-01 23:59:59');
  });
  it('keepForeverGame:只收 Game/DLC 且 Active,排除 Beta', () => {
    expect(keepForeverGame(perpetual)).toBe(true);
    expect(keepForeverGame(dlc)).toBe(true);
    expect(keepForeverGame(beta)).toBe(false);
  });
});
```

- [ ] **Step 2:跑測試確認失敗**

Run: `npx vitest run shared/src/gamerpower-parse.test.ts`
Expected: FAIL

- [ ] **Step 3:寫最小實作 `shared/src/gamerpower-parse.ts`**

```ts
import type { FreeGiveaway } from './types';

export interface RawGiveaway {
  id: number; title: string; worth: string; image: string; thumbnail: string;
  open_giveaway_url: string; type: string; platforms: string; end_date: string; status: string;
}

export const parsePlatforms = (s: string): string[] =>
  s.split(',').map(p => p.trim()).filter(Boolean);

export const toFreeGiveaway = (g: RawGiveaway): FreeGiveaway => ({
  id: String(g.id),
  source: 'gamerpower',
  title: g.title,
  worthUsd: g.worth && g.worth !== 'N/A' ? g.worth : undefined,
  image: g.image || g.thumbnail,
  platforms: parsePlatforms(g.platforms),
  endDate: g.end_date && g.end_date !== 'N/A' ? g.end_date : null,
  url: g.open_giveaway_url,
  type: g.type,
});

const KEEP_TYPES = new Set(['game', 'dlc']);
export const keepForeverGame = (g: RawGiveaway): boolean =>
  g.status?.toLowerCase() === 'active' && KEEP_TYPES.has(g.type?.toLowerCase());
```

- [ ] **Step 4:跑測試確認通過**

Run: `npx vitest run shared/src/gamerpower-parse.test.ts`
Expected: PASS（4 passed）

- [ ] **Step 5:Commit**

```bash
git add shared/src/gamerpower-parse.ts shared/src/gamerpower-parse.test.ts
git commit -m "功能: GamerPower 解析與永久入庫過濾(含測試)"
```

---

## Task 5:Steam 回應解析(TDD)

**Files:**
- Test: `shared/src/steam-parse.test.ts`
- Create: `shared/src/steam-parse.ts`

- [ ] **Step 1:寫失敗測試**

```ts
import { describe, it, expect } from 'vitest';
import { parseAppDetails, parseFeaturedItem } from './steam-parse';

describe('steam-parse', () => {
  it('parseAppDetails:有價格', () => {
    const r = parseAppDetails({
      name: 'Stardew Valley', is_free: false, header_image: 'h.jpg',
      price_overview: { currency: 'TWD', initial: 39800, final: 29800, discount_percent: 25 },
    });
    expect(r).toEqual({ nameZh: 'Stardew Valley', isFree: false, headerImage: 'h.jpg',
      priceCents: 29800, regularCents: 39800, discountPercent: 25, hasPrice: true });
  });
  it('parseAppDetails:免費遊戲無 price_overview', () => {
    const r = parseAppDetails({ name: 'Dota 2', is_free: true, header_image: 'd.jpg' });
    expect(r.hasPrice).toBe(false);
    expect(r.priceCents).toBe(0);
  });
  it('parseFeaturedItem:特價項目', () => {
    const r = parseFeaturedItem({
      id: 1091500, name: 'Cyberpunk 2077', discount_percent: 70,
      original_price: 159900, final_price: 47900, currency: 'TWD',
      header_image: 'c.jpg', large_capsule_image: 'cap.jpg', discount_expiration: 1750000000,
    });
    expect(r).toEqual({ appid: 1091500, name: 'Cyberpunk 2077', discountPercent: 70,
      regularCents: 159900, priceCents: 47900, headerImage: 'cap.jpg', discountExpiration: 1750000000 });
  });
});
```

- [ ] **Step 2:跑測試確認失敗**

Run: `npx vitest run shared/src/steam-parse.test.ts`
Expected: FAIL

- [ ] **Step 3:寫最小實作 `shared/src/steam-parse.ts`**

```ts
export interface PriceOverview { currency: string; initial: number; final: number; discount_percent: number; }
export interface AppDetailsData { name: string; is_free: boolean; header_image: string; price_overview?: PriceOverview; }
export interface ParsedApp {
  nameZh: string; isFree: boolean; headerImage: string;
  priceCents: number; regularCents: number; discountPercent: number; hasPrice: boolean;
}
export const parseAppDetails = (d: AppDetailsData): ParsedApp => ({
  nameZh: d.name,
  isFree: d.is_free,
  headerImage: d.header_image,
  priceCents: d.price_overview?.final ?? 0,
  regularCents: d.price_overview?.initial ?? 0,
  discountPercent: d.price_overview?.discount_percent ?? 0,
  hasPrice: !!d.price_overview,
});

export interface FeaturedItem {
  id: number; name: string; discount_percent: number; original_price: number;
  final_price: number; currency: string; header_image: string;
  large_capsule_image?: string; discount_expiration?: number;
}
export interface ParsedFeatured {
  appid: number; name: string; discountPercent: number;
  regularCents: number; priceCents: number; headerImage: string; discountExpiration?: number;
}
export const parseFeaturedItem = (it: FeaturedItem): ParsedFeatured => ({
  appid: it.id,
  name: it.name,
  discountPercent: it.discount_percent,
  regularCents: it.original_price,
  priceCents: it.final_price,
  headerImage: it.large_capsule_image || it.header_image,
  discountExpiration: it.discount_expiration || undefined,
});
```

- [ ] **Step 4:跑測試確認通過 + 補回 barrel**

Run: `npx vitest run shared/`
Expected: PASS（全部 shared 測試通過）
然後確認 `shared/src/index.ts` 已把 price/lowtracker/gamerpower-parse/steam-parse 全部 `export *`。

- [ ] **Step 5:Commit**

```bash
git add shared/src/steam-parse.ts shared/src/steam-parse.test.ts shared/src/index.ts
git commit -m "功能: Steam appdetails/featured 解析(含測試)"
```

---

## Task 6:SQLite schema 與讀寫(TDD,用暫存 DB)

**Files:**
- Test: `worker/src/db.test.ts`
- Create: `worker/src/db.ts`

- [ ] **Step 1:寫失敗測試(以記憶體 DB)**

```ts
import { describe, it, expect } from 'vitest';
import { openDb, recordPriceAndLow, getStats } from './db';

describe('db', () => {
  it('建表並記錄價格、維護最低', () => {
    const db = openDb(':memory:');
    recordPriceAndLow(db, 1, 1000, 298_00, 80);   // 第一次 → 最低=298
    recordPriceAndLow(db, 1, 2000, 400_00, 60);   // 較高 → 最低不變
    recordPriceAndLow(db, 1, 3000, 250_00, 83);   // 更低 → 最低=250
    const s = getStats(db, 1);
    expect(s?.observed_low_cents).toBe(250_00);
    expect(s?.observed_low_at).toBe(3000);
    expect(s?.observed_max_discount).toBe(83);
  });
});
```

- [ ] **Step 2:跑測試確認失敗**

Run: `npx vitest run worker/src/db.test.ts`
Expected: FAIL

- [ ] **Step 3:寫最小實作 `worker/src/db.ts`**

```ts
import Database from 'better-sqlite3';
import { evaluateLow } from '@ssc/shared';

export type DB = Database.Database;

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS games(
      appid INTEGER PRIMARY KEY, name_zh TEXT, name_en TEXT, header_image TEXT,
      regular_price_cents INTEGER, is_free INTEGER DEFAULT 0, first_seen INTEGER, last_seen INTEGER);
    CREATE TABLE IF NOT EXISTS price_history(
      id INTEGER PRIMARY KEY AUTOINCREMENT, appid INTEGER, observed_at INTEGER,
      price_cents INTEGER, discount_percent INTEGER);
    CREATE INDEX IF NOT EXISTS idx_ph_appid_time ON price_history(appid, observed_at);
    CREATE TABLE IF NOT EXISTS game_stats(
      appid INTEGER PRIMARY KEY, observed_low_cents INTEGER, observed_low_at INTEGER,
      observed_max_discount INTEGER DEFAULT 0, seeded_low_cents INTEGER, seeded_at INTEGER);
    CREATE TABLE IF NOT EXISTS free_giveaways(
      id TEXT PRIMARY KEY, source TEXT, title TEXT, worth_usd TEXT, image TEXT,
      platforms TEXT, end_date TEXT, url TEXT, type TEXT, last_seen INTEGER);
  `);
  return db;
}

export interface Stats {
  observed_low_cents: number | null; observed_low_at: number | null;
  observed_max_discount: number; seeded_low_cents: number | null;
}

export function getStats(db: DB, appid: number): Stats | undefined {
  return db.prepare(
    `SELECT observed_low_cents, observed_low_at, observed_max_discount, seeded_low_cents
     FROM game_stats WHERE appid = ?`).get(appid) as Stats | undefined;
}

export function recordPriceAndLow(
  db: DB, appid: number, observedAt: number, priceCents: number, discountPercent: number,
): void {
  db.prepare(`INSERT INTO price_history(appid, observed_at, price_cents, discount_percent)
              VALUES(?,?,?,?)`).run(appid, observedAt, priceCents, discountPercent);
  const prev = getStats(db, appid);
  const prevLow = prev?.observed_low_cents ?? null;
  const { isNewLow, lowCents } = evaluateLow(priceCents, prevLow);
  const lowAt = isNewLow ? observedAt : prev!.observed_low_at;
  const maxDisc = Math.max(prev?.observed_max_discount ?? 0, discountPercent);
  db.prepare(`
    INSERT INTO game_stats(appid, observed_low_cents, observed_low_at, observed_max_discount)
    VALUES(@appid,@low,@lowAt,@maxDisc)
    ON CONFLICT(appid) DO UPDATE SET
      observed_low_cents=@low, observed_low_at=@lowAt, observed_max_discount=@maxDisc
  `).run({ appid, low: lowCents, lowAt, maxDisc });
}
```

- [ ] **Step 4:跑測試確認通過**

Run: `npx vitest run worker/src/db.test.ts`
Expected: PASS（1 passed）

- [ ] **Step 5:Commit**

```bash
git add worker/src/db.ts worker/src/db.test.ts
git commit -m "功能: SQLite schema 與價格/最低維護(含測試)"
```

---

## Task 7:Steam 資料源 + P0 實測腳本

**Files:**
- Create: `worker/src/sources/steam.ts`
- Create: `worker/scripts/verify-sources.ts`

- [ ] **Step 1:寫 `worker/src/sources/steam.ts`(節流 + 退避)**

```ts
import { parseFeaturedItem, parseAppDetails, type ParsedFeatured, type ParsedApp } from '@ssc/shared';

const UA = 'SteamSaleChecker/0.1 (+personal portfolio site)';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (res.status === 429 || res.status === 403) { await sleep(10_000); throw new Error(`throttled ${res.status}`); }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

export async function fetchFeatured(): Promise<{ specials: ParsedFeatured[]; topSellers: ParsedFeatured[] }> {
  const j = await getJson('https://store.steampowered.com/api/featuredcategories?cc=tw&l=tchinese');
  const map = (arr: any[] = []) => arr.filter(x => x?.id).map(parseFeaturedItem);
  return { specials: map(j.specials?.items), topSellers: map(j.top_sellers?.items) };
}

// 逐款補資料;節流 ~1 req/s,{success:false} 回 null(略過)
export async function fetchAppDetails(appid: number, lang: 'tchinese' | 'english' = 'tchinese'): Promise<ParsedApp | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=tw&l=${lang}&filters=basic,price_overview`;
  const j = await getJson(url);
  const entry = j[appid];
  if (!entry?.success || !entry.data) return null;
  return parseAppDetails(entry.data);
}

export async function enrichMany(appids: number[]): Promise<Map<number, ParsedApp>> {
  const out = new Map<number, ParsedApp>();
  for (const id of appids) {
    try { const a = await fetchAppDetails(id); if (a) out.set(id, a); }
    catch (e) { /* 略過該款,稍後重試 */ }
    await sleep(1100);
  }
  return out;
}
```

- [ ] **Step 2:寫 P0 實測腳本 `worker/scripts/verify-sources.ts`**

```ts
import { fetchFeatured, fetchAppDetails } from '../src/sources/steam';

const main = async () => {
  const { specials, topSellers } = await fetchFeatured();
  console.log('specials:', specials.length, 'topSellers:', topSellers.length);
  console.log('sample special:', specials[0]);
  const sample = specials[0]?.appid ?? 413150;
  const d = await fetchAppDetails(sample);
  console.log('appdetails sample (台幣?):', d);
};
main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 3:實際跑 P0 驗證(確認回台幣)**

Run: `npm -w @ssc/worker run verify`
Expected: 印出 `specials`/`topSellers` 數量、第一筆特價(`priceCents`/`regularCents` 為 TWD 分值)、以及 appdetails 樣本。
⚠️ 若 `featuredcategories` 失效或非台幣,**停下來**回報;這是整個 deals 流程的基礎。

- [ ] **Step 4:(可選)驗證分頁搜尋端點是否可用**

在 `verify-sources.ts` 暫加一段 `fetch('https://store.steampowered.com/search/results/?specials=1&filter=topsellers&cc=tw&l=tchinese&json=1&start=0&count=50', {headers:{'User-Agent':UA}})`,印出 `total_count` 與是否含 `items`/`results_html`。
- 若回乾淨 JSON(含可解析的 appid)→ Task 9 的 pipeline 會用它擴充完整榜。
- 若格式不可靠 → **退回只用 `featuredcategories`**,Task 9 標註採此 fallback。
驗證後移除這段暫加程式碼。

- [ ] **Step 5:Commit**

```bash
git add worker/src/sources/steam.ts worker/scripts/verify-sources.ts
git commit -m "功能: Steam 資料源(featured/appdetails)與 P0 實測腳本"
```

---

## Task 8:GamerPower 資料源

**Files:**
- Create: `worker/src/sources/gamerpower.ts`

- [ ] **Step 1:寫 `worker/src/sources/gamerpower.ts`**

```ts
import { toFreeGiveaway, keepForeverGame, type RawGiveaway } from '@ssc/shared';
import type { FreeGiveaway } from '@ssc/shared';

const UA = 'SteamSaleChecker/0.1 (+personal portfolio site)';

export async function fetchFreeGiveaways(): Promise<FreeGiveaway[]> {
  const url = 'https://www.gamerpower.com/api/filter?platform=pc.steam.epic-games-store.gog&type=game.dlc';
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`GamerPower HTTP ${res.status}`);
  const raw = (await res.json()) as RawGiveaway[];
  return raw.filter(keepForeverGame).map(toFreeGiveaway);
}
```

> 註:GamerPower `/api/filter` 多平台用 `+` 或 `.` 連接視版本而定;Task 7 的 verify 一併實測,若 `.` 無效改 `+`(`platform=steam+epic-games-store+gog`)。`type` 同理。本步驟先用其一,verify 後校正。

- [ ] **Step 2:在 verify 腳本加一行實測 GamerPower 並跑**

於 `verify-sources.ts` 加:
```ts
import { fetchFreeGiveaways } from '../src/sources/gamerpower';
const free = await fetchFreeGiveaways();
console.log('free giveaways:', free.length, 'sample:', free[0]);
```
Run: `npm -w @ssc/worker run verify`
Expected: 印出永久入庫項數量與一筆樣本(`platforms` 為陣列、`endDate` 為 null 或日期字串)。

- [ ] **Step 3:Commit**

```bash
git add worker/src/sources/gamerpower.ts worker/scripts/verify-sources.ts
git commit -m "功能: GamerPower 資料源(永久入庫過濾)"
```

---

## Task 9:原子寫 JSON(TDD)

**Files:**
- Test: `worker/src/bake.test.ts`
- Create: `worker/src/bake.ts`

- [ ] **Step 1:寫失敗測試**

```ts
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
```

- [ ] **Step 2:跑測試確認失敗**

Run: `npx vitest run worker/src/bake.test.ts`
Expected: FAIL

- [ ] **Step 3:寫最小實作 `worker/src/bake.ts`**

```ts
import { writeFileSync, renameSync } from 'node:fs';

export function writeJsonAtomic(path: string, data: unknown): void {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data), 'utf8');
  renameSync(tmp, path);
}
```

- [ ] **Step 4:跑測試確認通過**

Run: `npx vitest run worker/src/bake.test.ts`
Expected: PASS（2 passed）

- [ ] **Step 5:Commit**

```bash
git add worker/src/bake.ts worker/src/bake.test.ts
git commit -m "功能: 原子寫 JSON(temp+rename,含測試)"
```

---

## Task 10:Pipeline 組裝 + 進入點(端到端跑通)

**Files:**
- Create: `worker/src/pipeline.ts`
- Create: `worker/src/index.ts`

- [ ] **Step 1:寫 `worker/src/pipeline.ts`**

```ts
import { join } from 'node:path';
import type { DB } from './db';
import { recordPriceAndLow, getStats } from './db';
import { fetchFeatured, enrichMany } from './sources/steam';
import { fetchFreeGiveaways } from './sources/gamerpower';
import { writeJsonAtomic } from './bake';
import { isAtLow } from '@ssc/shared';
import type { Deal, FreeGiveaway, Meta } from '@ssc/shared';

export interface RunResult { deals: Deal[]; free: FreeGiveaway[]; meta: Meta; }

export async function runPipeline(db: DB, dataDir: string, nowSec: number, trackingSince: number): Promise<RunResult> {
  // 1. 探索:特價 + 熱銷(熱銷優先排序)
  const { specials, topSellers } = await fetchFeatured();
  const rankMap = new Map<number, number>();
  topSellers.forEach((t, i) => rankMap.set(t.appid, i));            // 熱銷名次
  const onSale = specials.filter(s => s.discountPercent > 0);
  const appids = [...new Set(onSale.map(s => s.appid))];

  // 2. 補資料(台幣現價/原價/封面/繁中名)
  const enriched = await enrichMany(appids);

  // 3. 寫價格歷史 + 維護最低;組 Deal
  const deals: Deal[] = [];
  for (const s of onSale) {
    const a = enriched.get(s.appid);
    const priceCents = a?.hasPrice ? a.priceCents : s.priceCents;
    const regularCents = a?.hasPrice ? a.regularCents : s.regularCents;
    const discount = a?.hasPrice ? a.discountPercent : s.discountPercent;
    recordPriceAndLow(db, s.appid, nowSec, priceCents, discount);
    const st = getStats(db, s.appid);
    deals.push({
      appid: s.appid,
      nameZh: a?.nameZh ?? s.name,
      headerImage: a?.headerImage ?? s.headerImage,
      priceCents, regularCents, discountPercent: discount,
      rank: rankMap.get(s.appid) ?? 1_000 + deals.length,
      discountExpiration: s.discountExpiration,
      observedLowCents: st?.observed_low_cents ?? null,
      observedLowAt: st?.observed_low_at ?? null,
      isAtObservedLow: isAtLow(priceCents, st?.observed_low_cents ?? null),
      observedMaxDiscount: st?.observed_max_discount ?? discount,
    });
  }
  deals.sort((x, y) => x.rank - y.rank);

  // 4. 免費領取
  const free = await fetchFreeGiveaways();

  // 5. 烤 JSON
  const meta: Meta = { generatedAt: nowSec, trackingSince, dealCount: deals.length, freeCount: free.length, ok: true };
  writeJsonAtomic(join(dataDir, 'deals.json'), deals);
  writeJsonAtomic(join(dataDir, 'free.json'), free);
  writeJsonAtomic(join(dataDir, 'meta.json'), meta);
  return { deals, free, meta };
}
```

- [ ] **Step 2:寫 `worker/src/index.ts`(容錯:失敗不覆寫舊檔)**

```ts
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { openDb } from './db';
import { runPipeline } from './pipeline';
import { writeJsonAtomic } from './bake';
import type { Meta } from '@ssc/shared';

const DATA_DIR = process.env.SSC_DATA_DIR ?? join(process.cwd(), 'web', 'public', 'data');
const DB_PATH = process.env.SSC_DB ?? join(process.cwd(), 'data', 'steam.db');

const main = async () => {
  const now = Math.floor(Date.now() / 1000);
  const db = openDb(DB_PATH);
  // trackingSince:沿用既有 meta,否則為現在
  const metaPath = join(DATA_DIR, 'meta.json');
  let trackingSince = now;
  if (existsSync(metaPath)) {
    try { trackingSince = (JSON.parse(readFileSync(metaPath, 'utf8')) as Meta).trackingSince ?? now; } catch {}
  }
  try {
    const { meta } = await runPipeline(db, DATA_DIR, now, trackingSince);
    console.log(`OK deals=${meta.dealCount} free=${meta.freeCount}`);
  } catch (e) {
    console.error('pipeline 失敗,保留上次資料:', e);
    // 只更新 meta.ok=false,讓前端標示「資料較舊」;不動 deals/free
    if (existsSync(metaPath)) {
      const old = JSON.parse(readFileSync(metaPath, 'utf8')) as Meta;
      writeJsonAtomic(metaPath, { ...old, ok: false });
    }
    process.exit(1);
  }
};
main();
```

- [ ] **Step 3:建立資料夾並端到端跑一次**

Run:
```bash
mkdir -p data web/public/data
npm -w @ssc/worker run run
```
Expected: 印出 `OK deals=NN free=MM`;`web/public/data/` 出現 `deals.json`/`free.json`/`meta.json`;
`deals.json` 第一筆是熱銷且在特價的款、價格為台幣分值、`isAtObservedLow` 第一次跑多為 true(因首見即最低)。

- [ ] **Step 4:再跑一次,驗證史低邏輯**

Run: `npm -w @ssc/worker run run`(間隔再跑)
Expected: 同款若價格未降,`isAtObservedLow` 仍依當前價 vs 已記最低;`price_history` 每跑一次多一列(可用 `sqlite3 data/steam.db "select count(*) from price_history"` 檢查)。

- [ ] **Step 5:Commit**

```bash
git add worker/src/pipeline.ts worker/src/index.ts
git commit -m "功能: 抓取管線與進入點(端到端產出 JSON,含容錯)"
```

---

## Task 11:ITAD 一次性史低 seed(獨立腳本)

**Files:**
- Create: `worker/src/seed/itad-seed.ts`

> 此腳本只在上線前手動跑一次,把各款 Steam 史低寫入 `game_stats.seeded_low_cents` 並把 `observed_low_cents` 取兩者較低者。production 排程**不呼叫它**。需環境變數 `ITAD_API_KEY`(用後即棄)。

- [ ] **Step 1:寫 `worker/src/seed/itad-seed.ts`**

```ts
import { join } from 'node:path';
import { openDb, type DB } from '../db';

const KEY = process.env.ITAD_API_KEY;
const DB_PATH = process.env.SSC_DB ?? join(process.cwd(), 'data', 'steam.db');

async function lookupItadId(appid: number): Promise<string | null> {
  const r = await fetch(`https://api.isthereanydeal.com/games/lookup/v1?key=${KEY}&appid=${appid}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j?.game?.id ?? null;
}

// storelow/v2:body 為 ITAD game id 陣列;shops=61=Steam;country=TW
async function fetchStoreLows(ids: string[]): Promise<Map<string, number>> {
  const r = await fetch(`https://api.isthereanydeal.com/games/storelow/v2?key=${KEY}&country=TW&shops=61`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids),
  });
  const out = new Map<string, number>();
  if (!r.ok) return out;
  const j = await r.json();
  for (const g of j ?? []) {
    const low = g?.lows?.[0]?.price?.amount;          // 元
    if (g?.id && typeof low === 'number') out.set(g.id, Math.round(low * 100)); // 轉分
  }
  return out;
}

function seedAppids(db: DB): number[] {
  return (db.prepare('SELECT appid FROM game_stats').all() as { appid: number }[]).map(r => r.appid);
}

const main = async () => {
  if (!KEY) { console.error('需要 ITAD_API_KEY'); process.exit(1); }
  const db = openDb(DB_PATH);
  const appids = seedAppids(db);
  console.log(`seed ${appids.length} 款`);
  const idMap = new Map<number, string>();
  for (const id of appids) { const g = await lookupItadId(id); if (g) idMap.set(id, g); await new Promise(r => setTimeout(r, 250)); }
  const itadIds = [...idMap.values()];
  // 分批(每 200)
  const lows = new Map<string, number>();
  for (let i = 0; i < itadIds.length; i += 200) {
    const batch = itadIds.slice(i, i + 200);
    for (const [k, v] of await fetchStoreLows(batch)) lows.set(k, v);
  }
  const upd = db.prepare(`UPDATE game_stats SET seeded_low_cents=@low, seeded_at=@now,
    observed_low_cents=MIN(COALESCE(observed_low_cents, @low), @low) WHERE appid=@appid`);
  const now = Math.floor(Date.now() / 1000);
  for (const [appid, gid] of idMap) {
    const low = lows.get(gid); if (low != null) upd.run({ appid, low, now });
  }
  console.log('seed 完成');
};
main().catch(e => { console.error(e); process.exit(1); });
```

> ⚠️ 執行前先用一個已知 appid 實測 `country=TW` 是否回 TWD(設計風險項);若 ITAD 不回台幣,**不要** seed(改純自建追蹤,史低文案維持「追蹤以來最低」)。

- [ ] **Step 2:Commit(先不執行)**

```bash
git add worker/src/seed/itad-seed.ts
git commit -m "功能: ITAD 一次性史低 seed 腳本(手動執行)"
```

---

## Task 12:Astro 前端骨架 + 深色主題 + i18n

**Files:**
- Create: `web/`(由 `npm create astro` 產生後改造)
- Create: `web/src/layouts/Base.astro`, `web/src/i18n/zh-TW.json`, `web/src/i18n/en.json`

- [ ] **Step 1:建立 Astro 專案**

Run:
```bash
npm create astro@latest web -- --template minimal --no-install --no-git --skip-houston --typescript strict
npm install
```
Expected: `web/` 出現 Astro 結構;根 workspace 安裝完成。

- [ ] **Step 2:寫 i18n 字典 `web/src/i18n/zh-TW.json` 與 `en.json`**

`zh-TW.json`:
```json
{
  "title": "Steam 特價追蹤",
  "deals": "熱門特價榜",
  "endingSoon": "即將結束",
  "free": "免費領取",
  "atLow": "本站最低",
  "fromLow": "離本站最低差 NT$ {n}",
  "trackingSince": "追蹤自 {date}",
  "updatedAgo": "更新於 {n} 分鐘前",
  "claim": "前往領取",
  "perpetual": "永久入庫"
}
```
`en.json`:
```json
{
  "title": "Steam Deal Tracker",
  "deals": "Top deals",
  "endingSoon": "Ending soon",
  "free": "Free to keep",
  "atLow": "Lowest here",
  "fromLow": "NT$ {n} above our low",
  "trackingSince": "Tracking since {date}",
  "updatedAgo": "Updated {n} min ago",
  "claim": "Claim",
  "perpetual": "Keep forever"
}
```

- [ ] **Step 3:寫 `web/src/layouts/Base.astro`(深色電競 + 留白 token)**

```astro
---
const { lang = 'zh-TW' } = Astro.props;
---
<html lang={lang}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Steam 特價追蹤</title>
    <style is:global>
      :root{
        --bg:#0e1622; --surface:#16202d; --line:#2a3f5a;
        --text:#c7d5e0; --muted:#6d7e8f; --accent:#66c0f4;
        --price:#beee11; --discount-bg:#4c6b22; --discount-fg:#d2e885;
        --low-bg:#4a3416; --low-fg:#f0b95a;
        --radius:10px; --maxw:1100px;
      }
      *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);
        font-family:system-ui,"Noto Sans TC",sans-serif;line-height:1.6}
      .wrap{max-width:var(--maxw);margin:0 auto;padding:24px 16px}
      h1,h2{font-weight:500;color:#fff}
      a{color:var(--accent)}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
    </style>
  </head>
  <body><div class="wrap"><slot /></div></body>
</html>
```

- [ ] **Step 4:`astro dev` 確認骨架可起**

Run: `npm -w web run dev`
Expected: 本機 dev server 起得來、空白頁深色背景。

- [ ] **Step 5:Commit**

```bash
git add web
git commit -m "功能: Astro 前端骨架、深色主題與 i18n 字典"
```

---

## Task 13:特價榜呈現(DealCard / DealList / EndingSoon)

**Files:**
- Create: `web/src/components/DealCard.astro`, `web/src/components/format.ts`
- Modify: `web/src/pages/index.astro`

- [ ] **Step 1:寫前端格式化小工具 `web/src/components/format.ts`**

```ts
export const twd = (cents: number): string =>
  `NT$ ${Math.round(cents / 100).toLocaleString('en-US')}`;
export const minutesAgo = (generatedAtSec: number, nowMs = Date.now()): number =>
  Math.max(0, Math.round((nowMs / 1000 - generatedAtSec) / 60));
```

- [ ] **Step 2:寫 `web/src/components/DealCard.astro`**

```astro
---
import { twd } from './format';
const { deal, t } = Astro.props;
const diff = deal.observedLowCents != null ? deal.priceCents - deal.observedLowCents : null;
---
<article style="background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden">
  <img src={deal.headerImage} alt={deal.nameZh} loading="lazy" style="width:100%;display:block;aspect-ratio:460/215;object-fit:cover" />
  <div style="padding:12px 14px">
    <p style="margin:0 0 8px;color:#fff;font-weight:500">{deal.nameZh}</p>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <span style="background:var(--discount-bg);color:var(--discount-fg);padding:2px 7px;border-radius:6px;font-size:13px">-{deal.discountPercent}%</span>
      <span style="color:var(--price);font-size:17px;font-weight:500">{twd(deal.priceCents)}</span>
      <span style="color:var(--muted);text-decoration:line-through;font-size:13px">{twd(deal.regularCents)}</span>
    </div>
    {deal.isAtObservedLow
      ? <span style="background:var(--low-bg);color:var(--low-fg);padding:2px 7px;border-radius:6px;font-size:12px">{t.atLow}</span>
      : (diff != null && <span style="color:var(--muted);font-size:12px">{t.fromLow.replace('{n}', Math.round(diff/100).toLocaleString('en-US'))}</span>)}
  </div>
</article>
```

- [ ] **Step 3:改 `web/src/pages/index.astro` 讀 JSON 並渲染特價榜 + 即將結束**

```astro
---
import Base from '../layouts/Base.astro';
import DealCard from '../components/DealCard.astro';
import { minutesAgo } from '../components/format';
import zh from '../i18n/zh-TW.json';
import deals from '../public/data/deals.json';
import meta from '../public/data/meta.json';
const t = zh;
const now = Date.now();
const endingSoon = deals.filter((d:any) => d.discountExpiration && (d.discountExpiration - now/1000) < 48*3600);
const trackDate = new Date(meta.trackingSince * 1000).toISOString().slice(0,7);
---
<Base lang="zh-TW">
  <h1>{t.title}</h1>
  <p style="color:var(--muted)">{t.updatedAgo.replace('{n}', String(minutesAgo(meta.generatedAt, now)))} · {t.trackingSince.replace('{date}', trackDate)}{!meta.ok && ' · (資料較舊)'}</p>

  {endingSoon.length > 0 && <>
    <h2>{t.endingSoon}</h2>
    <div class="grid">{endingSoon.slice(0,8).map((d:any) => <DealCard deal={d} t={t} />)}</div>
  </>}

  <h2>{t.deals}</h2>
  <div class="grid">{deals.map((d:any) => <DealCard deal={d} t={t} />)}</div>
</Base>
```

> 註:Astro 直接 `import` `public/` 下 JSON 在 build 時內嵌;之後若要「資料更新不重 build」,改成在 island 內 `fetch('/data/deals.json')`(Task 15 處理動態化)。本步驟先用 build-time import 把畫面做出來。

- [ ] **Step 4:跑 dev 確認特價榜渲染**

Run: `npm -w web run dev`
Expected: 看到熱門特價榜卡片(封面、折扣、台幣價、史低徽章/差額)、若有則「即將結束」區、頂部更新時間與追蹤起始月份。

- [ ] **Step 5:Commit**

```bash
git add web/src/components web/src/pages/index.astro
git commit -m "功能: 特價榜與即將結束區呈現"
```

---

## Task 14:免費領取區呈現

**Files:**
- Create: `web/src/components/FreeCard.astro`
- Modify: `web/src/pages/index.astro`

- [ ] **Step 1:寫 `web/src/components/FreeCard.astro`**

```astro
---
const { item, t } = Astro.props;
---
<article style="background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden">
  <img src={item.image} alt={item.title} loading="lazy" style="width:100%;display:block;aspect-ratio:460/215;object-fit:cover" />
  <div style="padding:12px 14px">
    <p style="margin:0 0 8px;color:#fff;font-weight:500">{item.title}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <span style="background:var(--discount-bg);color:var(--discount-fg);padding:2px 7px;border-radius:6px;font-size:12px">{t.perpetual}</span>
      {item.platforms.slice(0,3).map((p:string) => <span style="border:1px solid var(--line);color:var(--muted);padding:2px 7px;border-radius:6px;font-size:12px">{p}</span>)}
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      {item.endDate && <span style="color:var(--muted);font-size:12px">~ {item.endDate.slice(0,10)}</span>}
      <a href={item.url} target="_blank" rel="noopener" style="margin-left:auto;font-size:13px">{t.claim} ↗</a>
    </div>
  </div>
</article>
```

- [ ] **Step 2:在 `index.astro` 加入免費區**

於 `index.astro` 的 frontmatter 加 `import FreeCard from '../components/FreeCard.astro';` 與
`import free from '../public/data/free.json';`,並在特價榜後加:
```astro
  <h2>{t.free}</h2>
  <div class="grid">{free.map((it:any) => <FreeCard item={it} t={t} />)}</div>
```

- [ ] **Step 3:跑 dev 確認免費區**

Run: `npm -w web run dev`
Expected: 免費領取卡片(永久入庫徽章、平台、領取期限、前往領取連結)正常顯示。

- [ ] **Step 4:Commit**

```bash
git add web/src/components/FreeCard.astro web/src/pages/index.astro
git commit -m "功能: 免費領取區呈現"
```

---

## Task 15:動態載入 + 價格圖 + 語言切換 + 歸屬

**Files:**
- Create: `web/src/components/app.client.ts`(島嶼:fetch JSON、語言切換、渲染)
- Create: `web/src/components/PriceChart.ts`(uPlot 封裝,後續詳版)
- Modify: `web/src/layouts/Base.astro`(頁尾歸屬)

> 目標:讓「資料更新不必重 build」、加語言切換、以及預留價格圖。把 Task 13/14 的 build-time import 改為 client 端 `fetch('/data/*.json')` 漸進增強。

- [ ] **Step 1:頁尾加歸屬聲明(`Base.astro` body 內 slot 後)**

```astro
<footer style="color:var(--muted);font-size:12px;border-top:1px solid var(--line);margin-top:32px;padding-top:12px">
  價格資料來自 Steam 商店;免費領取資料 Powered by
  <a href="https://www.gamerpower.com/" target="_blank" rel="noopener">GamerPower.com</a>。
  本站與 Valve 無任何關係。
</footer>
```

- [ ] **Step 2:寫 `web/src/components/app.client.ts`(client fetch + 語言切換)**

```ts
import zh from '../i18n/zh-TW.json';
import en from '../i18n/en.json';

type Dict = typeof zh;
const dicts: Record<string, Dict> = { 'zh-TW': zh, en };

async function load() {
  const [deals, free, meta] = await Promise.all([
    fetch('/data/deals.json').then(r => r.json()),
    fetch('/data/free.json').then(r => r.json()),
    fetch('/data/meta.json').then(r => r.json()),
  ]);
  return { deals, free, meta };
}

function currentLang(): string {
  return localStorage.getItem('ssc-lang') ?? 'zh-TW';
}

export async function boot() {
  const lang = currentLang();
  const t = dicts[lang];
  const { deals, free, meta } = await load();
  // 將資料掛到 window 供既有元件/重繪使用;最小版可只更新頂部時間與語言文案
  document.documentElement.lang = lang;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n as keyof Dict; if (t[k]) el.textContent = String(t[k]);
  });
  // 語言切換按鈕
  document.getElementById('lang-toggle')?.addEventListener('click', () => {
    localStorage.setItem('ssc-lang', lang === 'zh-TW' ? 'en' : 'zh-TW');
    location.reload();
  });
  console.debug('loaded', deals.length, free.length, meta.ok);
}
boot();
```

> 註:本步驟先把「client 載入 + 語言切換 + i18n 文字替換」做出來,並在 `index.astro` 加
> `<button id="lang-toggle">中/EN</button>` 與 `<script>import('../components/app.client.ts')</script>`。
> 卡片完整改為 client 端渲染可漸進進行;若時間有限,維持 build-time import 的卡片 + client 端更新頂部資訊亦可上線。

- [ ] **Step 3:價格圖預留 `web/src/components/PriceChart.ts`**

```ts
// 價格走勢圖:資料來自未來的 /data/history/<appid>.json(由 worker 另烤,屬後續迭代)
// MVP 先預留介面;有單款歷史 JSON 後以 uPlot 繪製。
export interface PricePoint { t: number; price: number; }
export function renderPriceChart(el: HTMLElement, points: PricePoint[]): void {
  // 後續以 uPlot 實作;此處先標記資料不足
  if (points.length < 2) { el.textContent = '價格歷史累積中…'; return; }
}
```

- [ ] **Step 4:build 驗證 + 本機預覽**

Run:
```bash
npm -w @ssc/worker run run     # 先確保 web/public/data/*.json 是新的
npm -w web run build
npm -w web run preview
```
Expected: build 成功;預覽頁特價/免費/即將結束三區正常、語言切換可用、頁尾有 GamerPower 歸屬、頂部更新時間正確。

- [ ] **Step 5:Commit**

```bash
git add web
git commit -m "功能: client 動態載入、語言切換、歸屬與價格圖預留"
```

---

## Self-Review(對照 spec)

- **特價榜(熱銷優先 + 儘量完整)** → Task 7(featured + 搜尋驗證)、Task 10(rankMap 熱銷排序)。✅
  完整榜的「分頁搜尋」於 Task 7 Step 4 驗證,可行才接;否則 fallback featured(已標註)。
- **即將結束區** → Task 13 Step 3(48h 篩選)。✅
- **免費(只永久入庫)** → Task 4(`keepForeverGame` 排除 Beta)、Task 8、Task 14。✅
- **史低自建 + 誠實標示** → Task 3、Task 6、Task 10(`isAtObservedLow`)、Task 13(「本站最低/差額」+ 追蹤起始月)。✅
- **一次性 ITAD seed** → Task 11(獨立、手動、production 不依賴)。✅
- **容錯/新鮮度** → Task 9(原子寫)、Task 10(失敗保留舊檔 + `meta.ok=false`)、Task 13/15(更新時間/較舊標示)。✅
- **i18n(繁中 + 英文)** → Task 12 字典、Task 15 語言切換。✅
- **深色電競 + 留白** → Task 12 主題 token、卡片樣式。✅
- **歸屬(GamerPower)** → Task 15 Step 1。✅
- **單位 ÷100 安全** → Task 2 集中換算 + 測試;前端 `format.ts` 同步。✅

**未涵蓋(屬後續子系統,本計畫不做)**:Discord 帳號/願望清單、Discord 降價通知、單款價格歷史 JSON 與完整 uPlot 價格圖、亮色主題、卡片/列表切換、搜尋單一遊戲、季節特賣專區。已於對應 Task 預留介面。

---

## 後續計畫(另開實作計畫)

- **Plan 2:Discord 帳號 + 願望清單**(`api/` Fastify、OAuth2、session、`/api/wishlist`、localStorage 合併、站內收藏高亮)。
- **Plan 3:Discord 降價通知**(`worker/src/notify.ts`、bot 專區頻道 @提醒、`notifications` 防重複、`guilds.join`)。
- **Plan 4:部署**(systemd timer + service、nginx 反代、子站路徑、Discord app/bot 設定)。

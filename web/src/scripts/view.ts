// 純邏輯層:過濾/排序/主題/史低日期/圖表配色。無 DOM、無 fetch,便於單元測試。

export interface Deal {
  appid: number; nameZh: string; headerImage: string; priceCents: number; regularCents: number;
  discountPercent: number; rank: number; discountExpiration?: number;
  observedLowCents: number | null; observedLowAt: number | null; isAtObservedLow: boolean; observedMaxDiscount: number;
}

export type SortKey = 'rank' | 'discount' | 'price' | 'regular' | 'low';
export type SortDir = 'asc' | 'desc';
export type ViewMode = 'card' | 'list';
export type Theme = 'dark' | 'light';

export interface ViewState {
  searchQuery: string;
  sortKey: SortKey;
  sortDir: SortDir;
  viewMode: ViewMode;
}

export function matchesQuery(d: Deal, lowerQ: string): boolean {
  return d.nameZh.toLowerCase().includes(lowerQ);
}

export function filterDeals(deals: Deal[], rawQuery: string): Deal[] {
  const q = rawQuery.trim().toLowerCase();
  return q ? deals.filter(d => matchesQuery(d, q)) : deals;
}

// 回傳新陣列(不可變);以 rank 做穩定 tie-break;low 為 null 排最後。
export function sortDeals(deals: Deal[], key: SortKey, dir: SortDir): Deal[] {
  const sign = dir === 'asc' ? 1 : -1;
  const val = (d: Deal): number => {
    switch (key) {
      case 'discount': return d.discountPercent;
      case 'price': return d.priceCents;
      case 'regular': return d.regularCents;
      case 'low': return d.observedLowCents ?? Number.POSITIVE_INFINITY;
      case 'rank':
      default: return d.rank;
    }
  };
  return [...deals].sort((a, b) => {
    const c = (val(a) - val(b)) * sign;
    return c !== 0 ? c : a.rank - b.rank;
  });
}

export function applyView(deals: Deal[], s: ViewState): Deal[] {
  return sortDeals(filterDeals(deals, s.searchQuery), s.sortKey, s.sortDir);
}

export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersDark ? 'dark' : 'light';
}

// 點同欄位 → 翻轉方向;點新欄位 → rank 預設 asc(推薦序),其餘預設 desc。
export function nextSortDir(current: SortKey, clicked: SortKey, dir: SortDir): SortDir {
  if (clicked !== current) return clicked === 'rank' ? 'asc' : 'desc';
  return dir === 'asc' ? 'desc' : 'asc';
}

// 史低日期(UTC,YYYY/MM/DD);null 顯示破折號。
export function fmtLowDate(atSec: number | null): string {
  if (atSec == null) return '—';
  const d = new Date(atSec * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}/${mm}/${dd}`;
}

export interface ChartPalette { line: string; low: string; axis: string; grid: string; }

// 從 CSS 變數讀色(getComputedStyle 注入 get);空值回退原深色預設,圖表在兩主題都正確。
export function readChartPalette(get: (name: string) => string): ChartPalette {
  return {
    line: get('--accent') || '#66c0f4',
    low: get('--low-fg') || '#f0b95a',
    axis: get('--muted') || '#6d7e8f',
    grid: get('--line') || '#2a3f5a',
  };
}

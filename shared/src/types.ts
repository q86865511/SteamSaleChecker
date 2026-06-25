export interface ReviewSummary {
  scoreDesc: string;   // Steam 評語(如「壓倒性好評」)
  positivePct: number; // 正評百分比 0–100
  total: number;       // 總評論數
}
export interface Deal {
  appid: number;
  nameZh: string;
  nameEn?: string;
  headerImage: string;
  priceCents: number;
  regularCents: number;
  discountPercent: number;
  rank: number;
  discountExpiration?: number;
  observedLowCents: number | null;
  observedLowAt: number | null;
  isAtObservedLow: boolean;
  observedMaxDiscount: number;
  review?: ReviewSummary | null;
}
// 商品詳細頁(/game)的 per-appid JSON 形狀
export interface GameDetail {
  appid: number; nameZh: string; headerImage: string;
  priceCents: number; regularCents: number; discountPercent: number; discountExpiration?: number;
  observedLowCents: number | null; observedLowAt: number | null; isAtObservedLow: boolean;
  review?: ReviewSummary | null;
  shortDescription?: string; genres?: string[]; releaseDate?: string; screenshots?: string[];
}
export interface FreeGiveaway {
  id: string;
  source: 'gamerpower';
  title: string;
  worthUsd?: string;
  image: string;
  platforms: string[];
  endDate: string | null;
  url: string;
  type: string;
}
export interface Meta {
  generatedAt: number;
  trackingSince: number;
  dealCount: number;
  freeCount: number;
  ok: boolean;
}

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
import type { ReviewSummary } from './types';
// 解析 Steam appreviews/{appid}?json=1 的 query_summary;success!=1 或缺資料回 null。
export const parseReviewSummary = (j: any): ReviewSummary | null => {
  if (j?.success !== 1 || !j.query_summary) return null;
  const q = j.query_summary;
  const total = Number(q.total_reviews) || 0;
  const positive = Number(q.total_positive) || 0;
  return {
    scoreDesc: String(q.review_score_desc ?? ''),
    positivePct: total > 0 ? Math.round((positive / total) * 100) : 0,
    total,
  };
};
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

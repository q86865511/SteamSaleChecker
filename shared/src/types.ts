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

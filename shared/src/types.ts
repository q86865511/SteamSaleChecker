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
  spark?: number[];      // 最近價格序列(降採樣),供列內迷你走勢圖
  genres?: string[];     // 類型(中文,來自 Steam l=tchinese)
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
// 通知偏好(per-user;worker 與 api 共用)
// delivery:'channel'=全域公告頻道(舊行為);'dm'=私訊;'guild'=使用者自己邀請 bot 進駐的伺服器。
export type NotifDelivery = 'channel' | 'dm' | 'guild';
export type NotifType = 'drop' | 'free' | 'digest';
// mention 模式:none=不標記 / self=標記本人(<@userId>)/ role=標記某身分組(<@&roleId>)。
export type MentionMode = 'none' | 'self' | 'role';
export interface MentionConfig { mode: MentionMode; roleId: string | null; }
// 使用者選定的 guild 路由。僅 delivery==='guild' 時生效。
export interface GuildRouting {
  guildId: string | null;        // 已選定的目標伺服器(必須是該使用者邀請過的)
  guildName: string | null;      // 顯示用;寫入時快取
  channelId: string | null;      // 統一頻道(預設:所有通知類型共用)
  // 每類型覆蓋(null=沿用 channelId)。預設全 null = 統一路由。
  channels: { drop: string | null; free: string | null; digest: string | null };
  mention: MentionConfig;
}
export interface NotifPrefs {
  dropEnabled: boolean; freeEnabled: boolean; digestHours: number; delivery: NotifDelivery; genres: string[];
  guild: GuildRouting;           // 伺服器路由;delivery!=='guild' 時被忽略(但仍持久化)
}
export const DEFAULT_GUILD_ROUTING: GuildRouting = {
  guildId: null, guildName: null, channelId: null,
  channels: { drop: null, free: null, digest: null },
  mention: { mode: 'none', roleId: null },
};
// 給前端 select / API 回傳用的輕量型別
export interface DiscordChannel { id: string; name: string; }
export interface DiscordRole { id: string; name: string; }

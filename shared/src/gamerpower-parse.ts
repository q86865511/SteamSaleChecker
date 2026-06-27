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
// 平台字串(CSV)是否含 Steam(Steam 原生或 Steam 序號;GamerPower 平台標準名)
export const isSteamGiveaway = (platforms: string): boolean =>
  parsePlatforms(platforms).some(p => p.toLowerCase().includes('steam'));
// 只收「永久 Game/DLC 且 Active」(排除 Beta、試玩);平台不限 —— Steam/Epic/GOG 等多平台都收,
// 各平台以 isSteamGiveaway 等判斷另作徽章標示。前端/通知以 platforms 呈現來源平台。
export const keepForeverGame = (g: RawGiveaway): boolean =>
  g.status?.toLowerCase() === 'active' && KEEP_TYPES.has(g.type?.toLowerCase());

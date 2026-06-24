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

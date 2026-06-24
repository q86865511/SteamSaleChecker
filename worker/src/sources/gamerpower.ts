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

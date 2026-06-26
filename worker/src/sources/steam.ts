import { parseFeaturedItem, parseAppDetails, parseReviewSummary, type ParsedFeatured, type ParsedApp, type ReviewSummary } from '@ssc/shared';
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
export async function fetchAppDetails(appid: number, lang: 'tchinese' | 'english' = 'tchinese'): Promise<ParsedApp | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=tw&l=${lang}&filters=basic,price_overview,genres,release_date,screenshots`;
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

// 標題正規化:小寫、NFKD 去重音、非英數字一律換空白、收斂空白。用於 giveaway 標題對 Steam app 名比對。
const normTitle = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// 用標題搜 Steam storesearch 解出 appid(GamerPower giveaway 不含 appid)。
// 只在「正規化標題相等」才回該 appid,查無對應回 null(寧可退精簡版也不錯配)。
// 抓取失敗會 throw(不吞),讓上層分辨「查詢失敗(下輪重試)」與「查無對應(快取 0)」。
export async function searchSteamAppid(title: string): Promise<number | null> {
  const q = normTitle(title);
  if (!q) return null;
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&cc=tw&l=tchinese`;
  const j = await getJson(url);
  const items = (j?.items ?? []) as { id?: number; name?: string }[];
  for (const it of items) {
    if (it?.id && normTitle(String(it.name ?? '')) === q) return Number(it.id);
  }
  return null;
}

// Steam 評論摘要(appreviews);失敗回 null。
export async function fetchReviewSummary(appid: number): Promise<ReviewSummary | null> {
  const url = `https://store.steampowered.com/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0&l=tchinese`;
  try { return parseReviewSummary(await getJson(url)); }
  catch { return null; }
}

export async function fetchTopSellerSpecialAppids(limit = 120): Promise<number[]> {
  const seen = new Set<number>();
  const ordered: number[] = [];
  for (let start = 0; start < limit && start < 1000; start += 50) {
    const url = `https://store.steampowered.com/search/results/?specials=1&filter=topsellers&cc=tw&l=tchinese&infinite=1&start=${start}&count=50`;
    let html: string;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) break;
      const j = await res.json();
      html = j?.results_html ?? '';
    } catch { break; }
    if (!html) break;
    const matches = [...html.matchAll(/data-ds-appid="(\d+)"/g)];
    if (matches.length === 0) break;
    for (const m of matches) {
      const id = Number(m[1].split(',')[0]); // bundles may list multiple; take first
      if (!seen.has(id)) { seen.add(id); ordered.push(id); }
      if (ordered.length >= limit) break;
    }
    await sleep(1100);
  }
  return ordered.slice(0, limit);
}

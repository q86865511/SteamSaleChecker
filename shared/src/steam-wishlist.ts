// 從使用者輸入(SteamID64 或 /profiles/<id> 網址)抽出 17 碼 SteamID64。
// vanity (/id/<name>) 需 ResolveVanityURL(Web API key),此處不支援、回 null。
export function extractSteamId64(input: string): string | null {
  const m = input.trim().match(/(7656\d{13})/);
  return m ? m[1] : null;
}

// 解析 IWishlistService/GetWishlist 回應(response.items[].appid)。
export function parseWishlistAppids(json: unknown): number[] {
  const items = (json as { response?: { items?: { appid?: unknown }[] } })?.response?.items;
  if (!Array.isArray(items)) return [];
  return items.map(i => i.appid).filter((a): a is number => Number.isInteger(a));
}

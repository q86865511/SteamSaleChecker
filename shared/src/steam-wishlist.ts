// 從使用者輸入(SteamID64 或 /profiles/<id> 網址)抽出 17 碼 SteamID64。
// 錨定:整串純 17 碼,或 /profiles/<17碼>(後面非數字),避免更長數字串/嵌入子字串誤判。
// vanity (/id/<name>) 需 ResolveVanityURL(Web API key),此處不支援、回 null。
export function extractSteamId64(input: string): string | null {
  const s = input.trim();
  if (/^7656\d{13}$/.test(s)) return s;
  const m = s.match(/\/profiles\/(7656\d{13})(?!\d)/);
  return m ? m[1] : null;
}

// 解析 IWishlistService/GetWishlist 回應(response.items[].appid);只收正整數 appid。
export function parseWishlistAppids(json: unknown): number[] {
  const items = (json as { response?: { items?: { appid?: unknown }[] } })?.response?.items;
  if (!Array.isArray(items)) return [];
  return items.map(i => i.appid).filter((a): a is number => Number.isInteger(a) && (a as number) > 0);
}

export interface StoreLow {
  cents: number;
  currency: string;
  lowAt: number | null; // 史低發生時間(unix 秒);ITAD 的 low.timestamp
}

// 解析 ITAD games/storelow/v2 回應(陣列;每筆含 id 與 lows[]),
// 取每款第一個 low 的價格;優先用 amountInt(整數 cents,無浮點誤差),
// 否則以 amount(元)四捨五入轉 cents。保留 currency 供台幣驗證、
// timestamp 作為史低時間(讓 game_stats.observed_low_at 誠實反映真實史低日期)。
export function parseStoreLows(json: unknown): Map<string, StoreLow> {
  const out = new Map<string, StoreLow>();
  if (!Array.isArray(json)) return out;
  for (const g of json) {
    const low = g?.lows?.[0];
    const id = g?.id;
    const price = low?.price;
    if (typeof id !== 'string' || !price) continue;
    const cents = typeof price.amountInt === 'number'
      ? price.amountInt
      : (typeof price.amount === 'number' ? Math.round(price.amount * 100) : null);
    if (cents == null) continue;
    const ms = typeof low.timestamp === 'string' ? Date.parse(low.timestamp) : NaN;
    out.set(id, {
      cents,
      currency: typeof price.currency === 'string' ? price.currency : '',
      lowAt: Number.isNaN(ms) ? null : Math.floor(ms / 1000),
    });
  }
  return out;
}

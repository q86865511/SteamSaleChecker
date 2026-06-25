// 把一段價格序列均勻降採樣到最多 n 點(保留頭尾),供列表內迷你走勢圖使用。
// 只保留價格值(不含時間戳),以縮小 deals.json 體積。
export function downsampleSpark(values: number[], n: number): number[] {
  if (n <= 0) return [];
  if (values.length <= n) return [...values];
  if (n === 1) return [values[values.length - 1]]; // 避免 (n-1)=0 除零

  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(values[Math.round((i * (values.length - 1)) / (n - 1))]);
  }
  return out;
}

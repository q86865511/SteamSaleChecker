import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface PricePoint { t: number; price: number; }

export function renderPriceChart(el: HTMLElement, points: PricePoint[], lowCents: number | null, emptyMsg: string): void {
  el.innerHTML = '';
  if (!points || points.length < 2) {
    const p = document.createElement('p');
    p.className = 'muted small';
    p.style.cssText = 'padding:32px 0;text-align:center';
    p.textContent = emptyMsg;
    el.appendChild(p);
    return;
  }
  const xs = points.map(p => p.t);
  const ys = points.map(p => p.price / 100);
  const data: uPlot.AlignedData = lowCents != null
    ? [xs, ys, xs.map(() => lowCents / 100)]
    : [xs, ys];
  const series: uPlot.Series[] = [
    {},
    { label: 'NT$', stroke: '#66c0f4', width: 2, points: { show: true, size: 5 } },
  ];
  if (lowCents != null) {
    series.push({ label: 'low', stroke: '#f0b95a', width: 1, dash: [4, 4], points: { show: false } });
  }
  const opts: uPlot.Options = {
    width: el.clientWidth || 560,
    height: 220,
    cursor: { y: false },
    legend: { show: false },
    series,
    axes: [
      {
        stroke: '#6d7e8f',
        grid: { stroke: '#2a3f5a', width: 1 },
        ticks: { stroke: '#2a3f5a' },
        values: (_u, vals) => vals.map(v => new Date(v * 1000).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })),
      },
      {
        stroke: '#6d7e8f',
        grid: { stroke: '#2a3f5a', width: 1 },
        ticks: { stroke: '#2a3f5a' },
        values: (_u, vals) => vals.map(v => 'NT$' + Math.round(v)),
      },
    ],
  };
  new uPlot(opts, data, el);
}

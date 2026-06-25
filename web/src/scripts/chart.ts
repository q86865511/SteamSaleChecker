import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { ChartPalette } from './view';

export interface PricePoint { t: number; price: number; }

const FALLBACK: ChartPalette = { line: '#66c0f4', low: '#f0b95a', axis: '#6d7e8f', grid: '#2a3f5a' };

export function renderPriceChart(
  el: HTMLElement, points: PricePoint[], lowCents: number | null, emptyMsg: string, pal: ChartPalette = FALLBACK,
): void {
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
    { label: 'NT$', stroke: pal.line, width: 2, points: { show: true, size: 5 } },
  ];
  if (lowCents != null) {
    series.push({ label: 'low', stroke: pal.low, width: 1, dash: [4, 4], points: { show: false } });
  }
  const axis = { stroke: pal.axis, grid: { stroke: pal.grid, width: 1 }, ticks: { stroke: pal.grid } };
  const opts: uPlot.Options = {
    width: el.clientWidth || 560,
    height: 220,
    cursor: { y: false },
    legend: { show: false },
    series,
    axes: [
      {
        ...axis,
        values: (_u, vals) => vals.map(v => new Date(v * 1000).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })),
      },
      {
        ...axis,
        values: (_u, vals) => vals.map(v => 'NT$' + Math.round(v)),
      },
    ],
  };
  new uPlot(opts, data, el);
}

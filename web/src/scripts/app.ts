import { twd, minutesAgo } from './format';
import zhTW from '../i18n/zh-TW.json';
import en from '../i18n/en.json';

interface Deal {
  appid: number; nameZh: string; headerImage: string; priceCents: number; regularCents: number;
  discountPercent: number; rank: number; discountExpiration?: number;
  observedLowCents: number | null; observedLowAt: number | null; isAtObservedLow: boolean; observedMaxDiscount: number;
}
interface FreeGiveaway {
  id: string; title: string; image: string; platforms: string[]; endDate: string | null; url: string; type: string; worthUsd?: string;
}
interface Meta { generatedAt: number; trackingSince: number; dealCount: number; freeCount: number; ok: boolean; }

type Dict = typeof zhTW;
const DICTS: Record<string, Dict> = { 'zh-TW': zhTW, en };

function getLang(): 'zh-TW' | 'en' {
  return localStorage.getItem('ssc-lang') === 'en' ? 'en' : 'zh-TW';
}
function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function safeUrl(u: string): string {
  return /^https?:\/\//i.test(u) ? u : '#';
}
function dealCard(d: Deal, t: Dict): string {
  const diff = d.observedLowCents != null ? d.priceCents - d.observedLowCents : null;
  const low = d.isAtObservedLow
    ? `<span class="badge badge-low">${t.atLow}</span>`
    : (diff != null && diff > 0
        ? `<span class="muted small">${t.fromLow.replace('{n}', Math.round(diff / 100).toLocaleString('en-US'))}</span>`
        : '');
  return `<article class="card">
    <img class="thumb" src="${esc(d.headerImage)}" alt="" loading="lazy" />
    <div class="card-body">
      <p class="card-title">${esc(d.nameZh)}</p>
      <div class="row">
        <span class="badge badge-disc">-${d.discountPercent}%</span>
        <span class="price">${twd(d.priceCents)}</span>
        <span class="was">${twd(d.regularCents)}</span>
      </div>
      <div class="row">${low}</div>
    </div>
  </article>`;
}
function freeCard(f: FreeGiveaway, t: Dict): string {
  const plats = f.platforms.slice(0, 3).map(p => `<span class="pill">${esc(p)}</span>`).join('');
  const end = f.endDate
    ? `<span class="muted small">~ ${esc(f.endDate.slice(0, 10))}</span>`
    : `<span class="muted small">${t.noEnd}</span>`;
  return `<article class="card">
    <img class="thumb" src="${esc(f.image)}" alt="" loading="lazy" />
    <div class="card-body">
      <p class="card-title">${esc(f.title)}</p>
      <div class="row"><span class="badge badge-disc">${t.perpetual}</span>${plats}</div>
      <div class="row">${end}<a class="claim-btn" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener">${t.claim} ↗</a></div>
    </div>
  </article>`;
}
function applyI18n(t: Dict): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n as keyof Dict;
    if (t[k]) el.textContent = String(t[k]);
  });
}
export async function boot(): Promise<void> {
  const lang = getLang();
  const t = DICTS[lang];
  document.documentElement.lang = lang;
  applyI18n(t);
  const toggle = document.getElementById('lang-toggle');
  if (toggle) {
    toggle.textContent = t.langName;
    toggle.addEventListener('click', () => {
      localStorage.setItem('ssc-lang', lang === 'zh-TW' ? 'en' : 'zh-TW');
      location.reload();
    });
  }
  let deals: Deal[] = [], free: FreeGiveaway[] = [], meta: Meta | null = null;
  try {
    [deals, free, meta] = await Promise.all([
      fetch('/data/deals.json').then(r => r.json()),
      fetch('/data/free.json').then(r => r.json()),
      fetch('/data/meta.json').then(r => r.json()),
    ]);
  } catch (e) { console.error('load failed', e); }
  const now = Date.now();
  const dealsEl = document.getElementById('deals');
  if (dealsEl) dealsEl.innerHTML = deals.map(d => dealCard(d, t)).join('');
  const ending = deals.filter(d => d.discountExpiration
    && d.discountExpiration - now / 1000 < 48 * 3600 && d.discountExpiration - now / 1000 > 0);
  const endSec = document.getElementById('ending-soon-sec');
  const endEl = document.getElementById('ending-soon');
  if (ending.length && endEl && endSec) {
    endEl.innerHTML = ending.map(d => dealCard(d, t)).join('');
    endSec.hidden = false;
  }
  const freeEl = document.getElementById('free');
  if (freeEl) freeEl.innerHTML = free.map(f => freeCard(f, t)).join('');
  const metaEl = document.getElementById('meta');
  if (metaEl && meta) {
    const mins = minutesAgo(meta.generatedAt, now);
    const date = new Date(meta.trackingSince * 1000).toISOString().slice(0, 7);
    metaEl.textContent =
      `${t.updatedAgo.replace('{n}', String(mins))} · ${t.trackingSince.replace('{date}', date)}${meta.ok ? '' : ' ' + t.stale}`;
  }
  const ft = document.getElementById('footer-text');
  if (ft) ft.textContent = t.footerText;
}

import { twd } from './format';
import { renderPriceChart, type PricePoint } from './chart';
import { fmtCountdown, fmtLowDate, readChartPalette, type ChartPalette, type Theme } from './view';
import { initTheme, setTheme, storeTheme } from './theme';
import { getLang, dict, applyI18n, type Dict } from './i18n';
import { getMe, loadWishlist } from './wishlist';
import { getTargets, putTarget } from './notif';
import type { GameDetail } from '@ssc/shared';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function currentPalette(): ChartPalette {
  const cs = getComputedStyle(document.documentElement);
  return readChartPalette(n => cs.getPropertyValue(n).trim());
}
function updateThemeIcon(theme: Theme, t: Dict): void {
  const btn = document.getElementById('theme-toggle');
  if (btn) { btn.textContent = theme === 'light' ? '☀️' : '🌙'; btn.setAttribute('aria-label', t.themeToggle); }
}

export async function bootGame(): Promise<void> {
  const lang = getLang();
  const t = dict();
  document.documentElement.lang = lang;
  updateThemeIcon(initTheme(), t);
  applyI18n(t);
  const langToggle = document.getElementById('lang-toggle');
  if (langToggle) {
    langToggle.textContent = t.langName;
    langToggle.addEventListener('click', () => { localStorage.setItem('ssc-lang', lang === 'zh-TW' ? 'en' : 'zh-TW'); location.reload(); });
  }

  const appid = Number(new URLSearchParams(location.search).get('appid'));
  const host = document.getElementById('game-detail');
  if (!host) return;
  let d: GameDetail | null = null;
  try { const r = await fetch(`/data/detail/${appid}.json`); if (r.ok) d = await r.json(); } catch { /* ignore */ }
  if (!d) {
    host.innerHTML = `<p class="muted" style="padding:48px 0;text-align:center">${esc(t.gameNotFound)} · <a href="/">${esc(t.backToDeals)}</a></p>`;
    return;
  }

  document.title = `${d.nameZh} — Steam 特價追蹤`;
  const rev = d.review;
  const lowLine = d.observedLowCents != null
    ? `${esc(t.atLow)}:${twd(d.observedLowCents)}${d.observedLowAt ? ` (${esc(fmtLowDate(d.observedLowAt))})` : ''}`
    : '';
  host.innerHTML = `
    <div class="gd-head">
      <img class="gd-cover" src="${esc(d.headerImage)}" alt="" />
      <div class="gd-info">
        <h1>${esc(d.nameZh)}</h1>
        <div class="row">
          ${d.discountPercent > 0 ? `<span class="badge badge-disc">-${d.discountPercent}%</span>` : ''}
          <span class="price">${twd(d.priceCents)}</span>
          ${d.regularCents !== d.priceCents ? `<span class="was">${twd(d.regularCents)}</span>` : ''}
          ${d.discountExpiration ? `<span class="countdown" data-exp="${d.discountExpiration}" aria-hidden="true"></span>` : (d.discountPercent > 0 ? `<span class="muted small">${esc(t.onSaleNoEnd)}</span>` : '')}
        </div>
        ${rev && rev.total ? `<p class="muted small">${esc(t.colReview)}:${esc(rev.scoreDesc)} 👍${rev.positivePct}% (${rev.total.toLocaleString('en-US')})</p>` : ''}
        ${lowLine ? `<p class="muted small">${lowLine}</p>` : ''}
        ${d.releaseDate ? `<p class="muted small">${esc(t.detailReleased)}:${esc(d.releaseDate)}</p>` : ''}
        ${d.genres && d.genres.length ? `<div class="row">${d.genres.map(g => `<span class="pill">${esc(g)}</span>`).join('')}</div>` : ''}
        <p><a class="lang-btn" href="https://store.steampowered.com/app/${d.appid}/" target="_blank" rel="noopener">${esc(t.viewOnSteam)}</a></p>
        <div id="gd-target" class="gd-target" hidden></div>
      </div>
    </div>
    <section><h2>${esc(t.priceHistory)}</h2><div id="gd-chart" class="gd-chart"></div></section>
    ${d.shortDescription ? `<section><h2>${esc(t.detailAbout)}</h2><p class="muted" style="max-width:760px">${esc(d.shortDescription)}</p></section>` : ''}
    ${d.screenshots && d.screenshots.length ? `<section><h2>${esc(t.detailScreenshots)}</h2><div class="gd-shots">${d.screenshots.map(s => `<img src="${esc(s)}" alt="" loading="lazy" />`).join('')}</div></section>` : ''}
  `;

  const chartEl = document.getElementById('gd-chart');
  let points: PricePoint[] = [];
  try { const r = await fetch(`/data/history/${appid}.json`); if (r.ok) points = await r.json(); } catch { /* ignore */ }
  if (chartEl) renderPriceChart(chartEl, points, d.observedLowCents, t.chartEmpty, currentPalette());

  // 目標價:登入且已收藏才顯示(跌破即通知)
  void (async () => {
    const me = await getMe();
    if (!me) return;
    const wished = (await loadWishlist(true)).has(appid);
    const slot = document.getElementById('gd-target');
    if (!wished || !slot) return;
    const cur = (await getTargets())[appid];
    slot.hidden = false;
    slot.innerHTML =
      `<label class="target-lbl">${esc(t.targetPriceLabel)} ` +
      `<input id="target-input" type="number" min="0" step="10" inputmode="numeric" placeholder="${esc(t.targetPricePh)}" value="${cur != null ? Math.round(cur / 100) : ''}"></label>` +
      `<button id="target-save" class="ctl-btn" type="button">${esc(t.save)}</button>` +
      `<span class="muted small">${esc(t.targetPriceHint)}</span><span id="target-status" class="muted small"></span>`;
    document.getElementById('target-save')?.addEventListener('click', async () => {
      const v = Number((document.getElementById('target-input') as HTMLInputElement).value);
      const ok = await putTarget(appid, v > 0 ? Math.round(v * 100) : null);
      const st = document.getElementById('target-status');
      if (st) st.textContent = ok ? `✓ ${t.saved}` : `✗ ${t.saveFailed}`;
    });
  })();

  const tick = (): void => {
    const nowSec = Date.now() / 1000;
    document.querySelectorAll<HTMLElement>('.countdown[data-exp]').forEach(el => {
      const txt = fmtCountdown(Number(el.dataset.exp) - nowSec, t.countdownDay);
      el.textContent = txt ?? t.ended;
      el.classList.toggle('ended', !txt);
    });
  };
  tick();
  setInterval(tick, 1000);

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const next: Theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    setTheme(next); storeTheme(next); updateThemeIcon(next, t);
    if (chartEl) renderPriceChart(chartEl, points, d!.observedLowCents, t.chartEmpty, currentPalette());
  });
}

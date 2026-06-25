import { twd, minutesAgo } from './format';
import {
  applyView, nextSortDir, fmtLowDate, fmtCountdown, NO_FILTERS, buildSparklinePath,
  type Deal, type ViewState, type SortKey, type SortDir, type ViewMode, type Theme,
} from './view';
import { getMe, loadWishlist, addWish, removeWish, mergeLocalOnLogin, discordLoginUrl, logout, getLocal, type Me } from './wishlist';
import { initTheme, setTheme, storeTheme } from './theme';
import { getLang, dict, applyI18n, type Dict } from './i18n';

interface FreeGiveaway {
  id: string; title: string; image: string; platforms: string[]; endDate: string | null; url: string; type: string; worthUsd?: string;
}
interface Meta { generatedAt: number; trackingSince: number; dealCount: number; freeCount: number; ok: boolean; }

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function safeUrl(u: string): string {
  return /^https?:\/\//i.test(u) ? u : '#';
}
function getViewMode(): ViewMode {
  return localStorage.getItem('ssc-view') === 'card' ? 'card' : 'list';
}

function reviewCell(d: Deal): string {
  const r = d.review;
  if (!r || !r.total) return '';
  const cls = r.positivePct >= 70 ? ' pos' : (r.positivePct >= 40 ? ' mid' : ' neg');
  return `<span class="review${cls}" title="${esc(r.scoreDesc)} · ${r.total.toLocaleString('en-US')}">👍${r.positivePct}%</span>`;
}

// 列內迷你價格走勢 sparkline(降:綠、升:紅);資料不足回空字串。
function sparkCell(d: Deal): string {
  if (!d.spark || d.spark.length < 2) return '';
  const path = buildSparklinePath(d.spark, 64, 18);
  if (!path) return '';
  const last = d.spark[d.spark.length - 1], first = d.spark[0];
  const dir = last < first ? 'down' : (last > first ? 'up' : 'flat');
  return `<svg class="spark ${dir}" viewBox="0 0 64 18" width="64" height="18" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

function dealCard(d: Deal, t: Dict, wished: boolean): string {
  const diff = d.observedLowCents != null ? d.priceCents - d.observedLowCents : null;
  const low = d.isAtObservedLow
    ? `<span class="badge badge-low">${t.atLow}</span>`
    : (diff != null && diff > 0
        ? `<span class="muted small">${t.fromLow.replace('{n}', Math.round(diff / 100).toLocaleString('en-US'))}</span>`
        : '');
  return `<article class="card clickable" data-appid="${d.appid}" data-title="${esc(d.nameZh)}" data-low="${d.observedLowCents ?? ''}">
    <img class="thumb" src="${esc(d.headerImage)}" alt="" loading="lazy" />
    <div class="card-body">
      <div class="title-row">
        <p class="card-title"><a class="card-title-link" href="/game?appid=${d.appid}">${esc(d.nameZh)}</a></p>
        <button class="wish-btn${wished ? ' on' : ''}" data-appid="${d.appid}" aria-label="${t.wishlist}" aria-pressed="${wished}">★</button>
      </div>
      <div class="row">
        <span class="badge badge-disc">-${d.discountPercent}%</span>
        <span class="price">${twd(d.priceCents)}</span>
        <span class="was">${twd(d.regularCents)}</span>
        ${reviewCell(d)}
        <span style="margin-left:auto">${sparkCell(d)}</span>
      </div>
      <div class="row">${low}${d.discountExpiration ? `<span class="countdown" data-exp="${d.discountExpiration}" style="margin-left:auto" aria-hidden="true"></span>` : `<span class="muted small" style="margin-left:auto">${esc(t.onSaleNoEnd)}</span>`}</div>
    </div>
  </article>`;
}

function dealTable(rows: Deal[], t: Dict, wishSet: Set<number>): string {
  const head = `<thead><tr>
      <th class="col-thumb"></th>
      <th class="col-name">${esc(t.colGame)}</th>
      <th class="col-num col-discount" aria-sort="none"><button class="col-sort" data-sort="discount">${esc(t.colDiscount)}</button></th>
      <th class="col-num col-price" aria-sort="none"><button class="col-sort" data-sort="price">${esc(t.colPrice)}</button></th>
      <th class="col-num col-regular" aria-sort="none"><button class="col-sort" data-sort="regular">${esc(t.colWas)}</button></th>
      <th class="col-trend">${esc(t.colTrend)}</th>
      <th class="col-status">${esc(t.colStatus)}</th>
      <th class="col-when">${esc(t.colLowDate)}</th>
      <th class="col-when">${esc(t.colEndsIn)}</th>
      <th class="col-review">${esc(t.colReview)}</th>
      <th class="col-star"></th>
    </tr></thead>`;
  const body = rows.map(d => {
    const wished = wishSet.has(d.appid);
    const status = d.isAtObservedLow ? `<span class="badge badge-low">${esc(t.atLow)}</span>` : '';
    return `<tr class="deal-row" data-appid="${d.appid}" data-title="${esc(d.nameZh)}" data-low="${d.observedLowCents ?? ''}">
      <td class="col-thumb"><img class="row-thumb" src="${esc(d.headerImage)}" alt="" loading="lazy" /></td>
      <td class="col-name"><a class="row-name-link" href="/game?appid=${d.appid}">${esc(d.nameZh)}</a></td>
      <td class="col-num"><span class="badge badge-disc">-${d.discountPercent}%</span></td>
      <td class="col-num price">${twd(d.priceCents)}</td>
      <td class="col-num was">${twd(d.regularCents)}</td>
      <td class="col-trend">${sparkCell(d)}</td>
      <td class="col-status">${status}</td>
      <td class="col-when">${esc(fmtLowDate(d.observedLowAt))}</td>
      <td class="col-when">${d.discountExpiration ? `<span class="countdown" data-exp="${d.discountExpiration}" aria-hidden="true"></span>` : `<span class="muted small">${esc(t.onSaleNoEnd)}</span>`}</td>
      <td class="col-review">${reviewCell(d)}</td>
      <td class="col-star"><button class="wish-btn${wished ? ' on' : ''}" data-appid="${d.appid}" aria-label="${esc(t.wishlist)}" aria-pressed="${wished}">★</button></td>
    </tr>`;
  }).join('');
  return `<table class="deal-table">${head}<tbody>${body}</tbody></table>`;
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
      <div class="row"><span class="badge badge-disc">${t.perpetual}</span>${plats}${f.worthUsd ? `<span class="pill">${t.worth} ${esc(f.worthUsd)}</span>` : ''}</div>
      <div class="row">${end}<a class="claim-btn" href="${esc(safeUrl(f.url))}" target="_blank" rel="noopener">${t.claim} ↗</a></div>
    </div>
  </article>`;
}

function updateThemeIcon(theme: Theme, t: Dict): void {
  const btn = document.getElementById('theme-toggle');
  if (btn) { btn.textContent = theme === 'light' ? '☀️' : '🌙'; btn.setAttribute('aria-label', t.themeToggle); }
}

export async function boot(): Promise<void> {
  const lang = getLang();
  const t = dict();
  document.documentElement.lang = lang;
  applyI18n(t);

  updateThemeIcon(initTheme(), t);

  const langToggle = document.getElementById('lang-toggle');
  if (langToggle) {
    langToggle.textContent = t.langName;
    langToggle.addEventListener('click', () => {
      localStorage.setItem('ssc-lang', lang === 'zh-TW' ? 'en' : 'zh-TW');
      location.reload();
    });
  }
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const next: Theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    setTheme(next); storeTheme(next); updateThemeIcon(next, t);
  });

  let deals: Deal[] = [], free: FreeGiveaway[] = [], meta: Meta | null = null;
  try {
    [deals, free, meta] = await Promise.all([
      fetch('/data/deals.json').then(r => r.json()),
      fetch('/data/free.json').then(r => r.json()),
      fetch('/data/meta.json').then(r => r.json()),
    ]);
  } catch (e) { console.error('load failed', e); }

  const me: Me | null = await getMe();
  const loggedIn = !!me;
  if (loggedIn && getLocal().length) await mergeLocalOnLogin();
  const wishSet = await loadWishlist(loggedIn);
  const authEl = document.getElementById('auth-control');
  if (authEl) {
    if (me) {
      authEl.innerHTML = `<span class="muted small" style="margin-right:8px">${esc(me.username)}</span><button id="logout-btn" class="lang-btn">${t.logout}</button>`;
      document.getElementById('logout-btn')?.addEventListener('click', async () => { await logout(); location.reload(); });
    } else {
      authEl.innerHTML = `<a class="lang-btn" href="${discordLoginUrl()}">${t.login}</a>`;
    }
  }

  const allDeals: Deal[] = deals;
  const state: ViewState = { searchQuery: '', sortKey: 'rank', sortDir: 'asc', viewMode: getViewMode(), filters: { ...NO_FILTERS } };

  // 類型篩選下拉:由實際 deals 的 genres 聯集動態填(避免寫死英文清單與 DB 中文對不上)
  const typeSel = document.getElementById('filter-type') as HTMLSelectElement | null;
  if (typeSel) {
    const genreSet = new Set<string>();
    for (const d of allDeals) for (const g of d.genres ?? []) genreSet.add(g);
    for (const g of [...genreSet].sort((a, b) => a.localeCompare(b, lang))) {
      const o = document.createElement('option');
      o.value = g; o.textContent = g;
      typeSel.appendChild(o);
    }
  }

  function updateSortIndicators(): void {
    document.querySelectorAll<HTMLElement>('.deal-table th[aria-sort]').forEach(th => {
      const key = th.querySelector<HTMLButtonElement>('.col-sort')?.dataset.sort;
      th.setAttribute('aria-sort', key === state.sortKey ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
  }
  function tickCountdowns(): void {
    const nowSec = Date.now() / 1000;
    document.querySelectorAll<HTMLElement>('.countdown[data-exp]').forEach(el => {
      const txt = fmtCountdown(Number(el.dataset.exp) - nowSec, t.countdownDay);
      if (txt) { el.textContent = txt; el.classList.remove('ended'); }
      else { el.textContent = t.ended; el.classList.add('ended'); }
    });
  }
  function render(): void {
    const host = document.getElementById('deals-host');
    if (!host) return;
    host.dataset.view = state.viewMode;
    const rows = applyView(allDeals, state);
    if (rows.length === 0) host.innerHTML = `<div class="empty-state" role="status">${esc(t.noResults)}</div>`;
    else if (state.viewMode === 'card') host.innerHTML = `<div class="grid">${rows.map(d => dealCard(d, t, wishSet.has(d.appid))).join('')}</div>`;
    else host.innerHTML = dealTable(rows, t, wishSet);
    updateSortIndicators();
    tickCountdowns();
  }
  function updateViewToggle(): void {
    const btn = document.getElementById('view-toggle');
    if (!btn) return;
    // 顯示「切換到」的目標檢視;按鈕文字即無障礙名稱(故 index.astro 不設 aria-label/aria-pressed)
    btn.textContent = state.viewMode === 'list' ? t.viewCard : t.viewList;
  }
  function syncSortSelect(): void {
    const sel = document.getElementById('sort-select') as HTMLSelectElement | null;
    if (!sel) return;
    const v = `${state.sortKey}-${state.sortDir}`;
    const opt = [...sel.options].find(o => o.value === v);
    sel.selectedIndex = opt ? opt.index : -1; // 無對應選項(如 原價排序)時顯示空白,避免與表格不符
  }

  // ending-soon + free render once (unchanged behavior)
  const now = Date.now();
  const ending = deals.filter(d => d.discountExpiration
    && d.discountExpiration - now / 1000 < 48 * 3600 && d.discountExpiration - now / 1000 > 0);
  const endSec = document.getElementById('ending-soon-sec');
  const endEl = document.getElementById('ending-soon');
  if (ending.length && endEl && endSec) {
    endEl.innerHTML = ending.map(d => dealCard(d, t, wishSet.has(d.appid))).join('');
    endSec.hidden = false;
  }
  const freeEl = document.getElementById('free');
  if (freeEl) freeEl.innerHTML = free.map(f => freeCard(f, t)).join('');

  render();
  updateViewToggle();
  setInterval(tickCountdowns, 1000);

  const onItemClick = async (e: Event) => {
    const target = e.target as HTMLElement;
    const sortBtn = target.closest<HTMLButtonElement>('.col-sort');
    if (sortBtn) {
      const key = sortBtn.dataset.sort as SortKey;
      state.sortDir = nextSortDir(state.sortKey, key, state.sortDir);
      state.sortKey = key;
      syncSortSelect();
      render();
      return;
    }
    const wishBtn = target.closest<HTMLButtonElement>('.wish-btn');
    if (wishBtn) {
      e.stopPropagation();
      const appid = Number(wishBtn.dataset.appid);
      const nowOn = !(wishBtn.getAttribute('aria-pressed') === 'true');
      try {
        if (nowOn) { await addWish(appid, loggedIn); wishSet.add(appid); }
        else { await removeWish(appid, loggedIn); wishSet.delete(appid); }
        // 同步該遊戲的所有 ★(熱門榜 + 即將結束區、卡片/列表皆涵蓋)
        document.querySelectorAll<HTMLButtonElement>(`.wish-btn[data-appid="${appid}"]`).forEach(b => {
          b.classList.toggle('on', nowOn);
          b.setAttribute('aria-pressed', String(nowOn));
        });
      } catch { /* ignore network error, keep UI */ }
      return;
    }
    if (target.closest('a')) return; // 名稱連結自行導航
    const item = target.closest<HTMLElement>('.card.clickable, tr.deal-row');
    if (!item) return;
    location.href = `/game?appid=${Number(item.dataset.appid)}`;
  };
  document.getElementById('deals-host')?.addEventListener('click', onItemClick);
  document.getElementById('ending-soon')?.addEventListener('click', onItemClick);

  document.getElementById('deal-search')?.addEventListener('input', (e) => {
    state.searchQuery = (e.target as HTMLInputElement).value;
    render(); // 120 筆過濾為亞毫秒,直接重渲染;搜尋框在 toolbar(host 外)故不丟焦點
  });
  document.getElementById('sort-select')?.addEventListener('change', (e) => {
    const [k, d] = (e.target as HTMLSelectElement).value.split('-');
    state.sortKey = k as SortKey; state.sortDir = d as SortDir;
    render();
  });
  document.getElementById('view-toggle')?.addEventListener('click', () => {
    state.viewMode = state.viewMode === 'list' ? 'card' : 'list';
    localStorage.setItem('ssc-view', state.viewMode);
    updateViewToggle();
    render();
  });
  document.getElementById('filter-discount')?.addEventListener('change', (e) => {
    state.filters!.minDiscount = Number((e.target as HTMLSelectElement).value) || 0;
    render();
  });
  document.getElementById('filter-maxprice')?.addEventListener('input', (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    state.filters!.maxPriceCents = v > 0 ? Math.round(v * 100) : null;
    render();
  });
  document.getElementById('filter-atlow')?.addEventListener('change', (e) => {
    state.filters!.atLowOnly = (e.target as HTMLInputElement).checked;
    render();
  });
  document.getElementById('filter-type')?.addEventListener('change', (e) => {
    state.filters!.genre = (e.target as HTMLSelectElement).value || null;
    render();
  });

  const metaEl = document.getElementById('meta');
  if (metaEl && meta) {
    const mins = minutesAgo(meta.generatedAt, now);
    const date = new Date(meta.trackingSince * 1000).toISOString().slice(0, 7);
    metaEl.textContent =
      `${t.updatedAgo.replace('{n}', String(mins))} · ${t.trackingSince.replace('{date}', date)}${meta.ok ? '' : ' ' + t.stale}`;
  }
  const ft = document.getElementById('footer-text');
  if (ft) ft.textContent = t.footerText;
  const ab = document.getElementById('about-body');
  if (ab) ab.textContent = t.aboutBody;
}

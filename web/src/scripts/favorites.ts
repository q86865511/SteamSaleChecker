import { twd } from './format';
import { initTheme, setTheme, storeTheme } from './theme';
import { getLang, dict, applyI18n, type Dict } from './i18n';
import { getMe, loadWishlist, removeWish, mergeLocalOnLogin, discordLoginUrl, logout, getLocal, importSteamWishlist, type Me } from './wishlist';
import { getTargets, putTarget } from './notif';
import { type Theme } from './view';

interface GameIndexEntry { appid: number; nameZh: string; headerImage: string; observedLowCents: number | null; observedLowAt: number | null; }
interface FavDeal { appid: number; nameZh: string; headerImage: string; priceCents: number; regularCents: number; discountPercent: number; observedLowCents: number | null; }

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
function updateThemeIcon(theme: Theme, t: Dict): void {
  const btn = document.getElementById('theme-toggle');
  if (btn) { btn.textContent = theme === 'light' ? '☀️' : '🌙'; btn.setAttribute('aria-label', t.themeToggle); }
}

export async function bootFavorites(): Promise<void> {
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
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const next: Theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    setTheme(next); storeTheme(next); updateThemeIcon(next, t);
  });

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

  let index: GameIndexEntry[] = [], deals: FavDeal[] = [];
  try {
    [index, deals] = await Promise.all([
      fetch('/data/games-index.json').then(r => (r.ok ? r.json() : [])),
      fetch('/data/deals.json').then(r => (r.ok ? r.json() : [])),
    ]);
  } catch { /* ignore */ }
  const dealMap = new Map<number, FavDeal>(deals.map(d => [d.appid, d]));
  const idxMap = new Map<number, GameIndexEntry>(index.map(g => [g.appid, g]));
  const targets: Record<number, number> = loggedIn ? await getTargets() : {};

  // Steam 願望單匯入(登入才顯示)
  const importSec = document.getElementById('steam-import');
  if (loggedIn && importSec) {
    importSec.hidden = false;
    document.getElementById('steam-import-btn')?.addEventListener('click', async () => {
      const input = document.getElementById('steam-id-input') as HTMLInputElement | null;
      const status = document.getElementById('steam-import-status');
      const val = input?.value.trim();
      if (!val) return;
      if (status) status.textContent = '…';
      const res = await importSteamWishlist(val);
      if (res) {
        for (const id of res.wishlist) wishSet.add(id);
        render();
        if (status) status.textContent = t.importDone.replace('{n}', String(res.imported));
      } else if (status) { status.textContent = t.importFail; }
    });
  }

  const hostEl = document.getElementById('fav-list');
  if (!hostEl) return;
  const host: HTMLElement = hostEl;

  function favCard(appid: number): string {
    const deal = dealMap.get(appid);
    const idx = idxMap.get(appid);
    const name = deal?.nameZh ?? idx?.nameZh ?? `App ${appid}`;
    const img = deal?.headerImage ?? idx?.headerImage ?? '';
    const low = deal?.observedLowCents ?? idx?.observedLowCents ?? null;
    const priceRow = deal
      ? `<div class="row"><span class="badge badge-disc">-${deal.discountPercent}%</span><span class="price">${twd(deal.priceCents)}</span><span class="was">${twd(deal.regularCents)}</span></div>`
      : `<div class="row"><span class="muted small">${esc(t.favNotOnSale)}</span></div>`;
    const lowRow = low != null ? `<div class="row"><span class="muted small">${esc(t.atLow)}:${twd(low)}</span></div>` : '';
    const cur = targets[appid];
    const targetRow = loggedIn
      ? `<div class="row gd-target"><label class="target-lbl">${esc(t.targetPriceLabel)} ` +
        `<input class="target-input" data-appid="${appid}" type="number" min="0" step="10" inputmode="numeric" placeholder="${esc(t.targetPricePh)}" value="${cur != null ? Math.round(cur / 100) : ''}"></label>` +
        `<button class="target-save ctl-btn" type="button" data-appid="${appid}">${esc(t.save)}</button>` +
        `<span class="target-status muted small" data-appid="${appid}"></span></div>`
      : '';
    return `<article class="card clickable" data-appid="${appid}">
      ${img ? `<a href="/game?appid=${appid}" tabindex="-1"><img class="thumb" src="${esc(img)}" alt="" loading="lazy" /></a>` : ''}
      <div class="card-body">
        <div class="title-row">
          <p class="card-title"><a class="card-title-link" href="/game?appid=${appid}">${esc(name)}</a></p>
          <button class="wish-btn on" data-appid="${appid}" aria-label="${esc(t.wishlist)}" aria-pressed="true">★</button>
        </div>
        ${priceRow}${lowRow}${targetRow}
      </div>
    </article>`;
  }
  function render(): void {
    const ids = [...wishSet];
    if (ids.length === 0) { host.innerHTML = `<div class="empty-state" role="status">${esc(t.favEmpty)}</div>`; return; }
    host.innerHTML = `<div class="grid">${ids.map(favCard).join('')}</div>`;
  }
  render();

  host.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>('.wish-btn');
    if (btn) {
      e.preventDefault();
      const appid = Number(btn.dataset.appid);
      try { await removeWish(appid, loggedIn); wishSet.delete(appid); render(); } catch { /* keep */ }
      return;
    }
    const saveBtn = target.closest<HTMLButtonElement>('.target-save');
    if (saveBtn) {
      e.preventDefault();
      const appid = Number(saveBtn.dataset.appid);
      const input = host.querySelector<HTMLInputElement>(`.target-input[data-appid="${appid}"]`);
      const v = Number(input?.value);
      const cents = v > 0 ? Math.round(v * 100) : null;
      const ok = await putTarget(appid, cents);
      if (ok) { if (cents == null) delete targets[appid]; else targets[appid] = cents; }
      const st = host.querySelector<HTMLElement>(`.target-status[data-appid="${appid}"]`);
      if (st) st.textContent = ok ? `✓ ${t.saved}` : `✗ ${t.saveFailed}`;
      return;
    }
    if (target.closest('.gd-target')) return; // 目標價輸入區不導航
    if (target.closest('a')) return;
    const card = target.closest<HTMLElement>('.card.clickable');
    if (card) location.href = `/game?appid=${Number(card.dataset.appid)}`;
  });
}

import { initTheme, setTheme, storeTheme, storedThemeChoice } from './theme';
import { resolveTheme, type Theme, type ViewMode } from './view';
import { getLang, dict, applyI18n } from './i18n';
import { getMe } from './wishlist';
import { getNotifPrefs, putNotifPrefs } from './notif';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// 單選 radiogroup:標記選中(aria-checked + roving tabindex);.on 供樣式。
function markRadio(groupId: string, attr: string, value: string): void {
  document.querySelectorAll<HTMLButtonElement>(`#${groupId} .seg-btn`).forEach(b => {
    const on = b.getAttribute(attr) === value;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
}

// 接上點擊 + 方向鍵(WAI-ARIA radiogroup);選擇時呼叫 onChoose(value)。
function wireRadioGroup(groupId: string, attr: string, onChoose: (value: string) => void): void {
  const group = document.getElementById(groupId);
  if (!group) return;
  const choose = (b: HTMLButtonElement | null): void => { if (b) onChoose(b.getAttribute(attr) ?? ''); };
  group.addEventListener('click', (e) => choose((e.target as HTMLElement).closest<HTMLButtonElement>('.seg-btn')));
  group.addEventListener('keydown', (e) => {
    const list = [...group.querySelectorAll<HTMLButtonElement>('.seg-btn')];
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % list.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + list.length) % list.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = list.length - 1;
    if (j < 0) return;
    e.preventDefault();
    list[j].focus();
    choose(list[j]);
  });
}

export function bootSettings(): void {
  initTheme();
  const lang = getLang();
  document.documentElement.lang = lang;
  applyI18n(dict());

  markRadio('theme-seg', 'data-theme-choice', storedThemeChoice());
  markRadio('lang-seg', 'data-lang-choice', lang);
  markRadio('view-seg', 'data-view-choice', localStorage.getItem('ssc-view') === 'card' ? 'card' : 'list');

  wireRadioGroup('theme-seg', 'data-theme-choice', (choice) => {
    const c = choice as Theme | 'system';
    storeTheme(c);
    setTheme(c === 'system'
      ? resolveTheme(null, window.matchMedia('(prefers-color-scheme: dark)').matches)
      : c);
    markRadio('theme-seg', 'data-theme-choice', c);
  });

  wireRadioGroup('lang-seg', 'data-lang-choice', (choice) => {
    if (choice !== lang) { localStorage.setItem('ssc-lang', choice); location.reload(); }
  });

  wireRadioGroup('view-seg', 'data-view-choice', (choice) => {
    localStorage.setItem('ssc-view', choice); // 套用於特價頁
    markRadio('view-seg', 'data-view-choice', choice);
  });

  void bootNotifPrefs();
}

// 通知偏好(登入才顯示):讀回 → 還原各 radiogroup/類型多選 → 改動即 PUT。
async function bootNotifPrefs(): Promise<void> {
  const me = await getMe();
  const hint = document.getElementById('notif-login-hint');
  const section = document.getElementById('notif-section');
  if (!me) { if (hint) hint.hidden = false; return; }
  const prefs = await getNotifPrefs();
  if (!prefs || !section) { if (hint) hint.hidden = false; return; }
  section.hidden = false;

  markRadio('notif-drop-seg', 'data-drop-choice', prefs.dropEnabled ? 'on' : 'off');
  markRadio('notif-free-seg', 'data-free-choice', prefs.freeEnabled ? 'on' : 'off');
  markRadio('notif-digest-seg', 'data-digest-choice', String(prefs.digestHours));
  markRadio('notif-delivery-seg', 'data-delivery-choice', prefs.delivery);

  wireRadioGroup('notif-drop-seg', 'data-drop-choice', (v) => {
    markRadio('notif-drop-seg', 'data-drop-choice', v); void putNotifPrefs({ dropEnabled: v === 'on' });
  });
  wireRadioGroup('notif-free-seg', 'data-free-choice', (v) => {
    markRadio('notif-free-seg', 'data-free-choice', v); void putNotifPrefs({ freeEnabled: v === 'on' });
  });
  wireRadioGroup('notif-digest-seg', 'data-digest-choice', (v) => {
    markRadio('notif-digest-seg', 'data-digest-choice', v); void putNotifPrefs({ digestHours: Number(v) });
  });
  wireRadioGroup('notif-delivery-seg', 'data-delivery-choice', (v) => {
    markRadio('notif-delivery-seg', 'data-delivery-choice', v); void putNotifPrefs({ delivery: v === 'dm' ? 'dm' : 'channel' });
  });

  // 類型多選(由 genres.json 動態產生;空=不限)
  const host = document.getElementById('notif-genres');
  if (host) {
    let genres: string[] = [];
    try { const r = await fetch('/data/genres.json'); if (r.ok) genres = await r.json(); } catch { /* ignore */ }
    const selected = new Set(prefs.genres);
    host.innerHTML = genres.map(g =>
      `<button class="genre-btn${selected.has(g) ? ' on' : ''}" type="button" aria-pressed="${selected.has(g)}" data-genre="${esc(g)}">${esc(g)}</button>`).join('');
    host.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.genre-btn');
      if (!b) return;
      const g = b.dataset.genre as string;
      if (selected.has(g)) selected.delete(g); else selected.add(g);
      b.classList.toggle('on', selected.has(g));
      b.setAttribute('aria-pressed', String(selected.has(g)));
      void putNotifPrefs({ genres: [...selected] });
    });
  }
}

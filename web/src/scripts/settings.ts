import { initTheme, setTheme, storeTheme, storedThemeChoice } from './theme';
import { resolveTheme, type Theme, type ViewMode } from './view';
import { getLang, dict, applyI18n } from './i18n';

function markActive(groupId: string, attr: string, value: string): void {
  document.querySelectorAll<HTMLButtonElement>(`#${groupId} .seg-btn`).forEach(b => {
    const on = b.getAttribute(attr) === value;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

export function bootSettings(): void {
  initTheme();
  const lang = getLang();
  document.documentElement.lang = lang;
  applyI18n(dict());

  markActive('theme-seg', 'data-theme-choice', storedThemeChoice());
  markActive('lang-seg', 'data-lang-choice', lang);
  markActive('view-seg', 'data-view-choice', localStorage.getItem('ssc-view') === 'card' ? 'card' : 'list');

  document.getElementById('theme-seg')?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.seg-btn');
    if (!b) return;
    const choice = b.dataset.themeChoice as Theme | 'system';
    storeTheme(choice);
    setTheme(choice === 'system'
      ? resolveTheme(null, window.matchMedia('(prefers-color-scheme: dark)').matches)
      : choice);
    markActive('theme-seg', 'data-theme-choice', choice);
  });

  document.getElementById('lang-seg')?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.seg-btn');
    if (!b) return;
    const choice = b.dataset.langChoice as 'zh-TW' | 'en';
    if (choice !== lang) { localStorage.setItem('ssc-lang', choice); location.reload(); }
  });

  document.getElementById('view-seg')?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.seg-btn');
    if (!b) return;
    const choice = b.dataset.viewChoice as ViewMode;
    localStorage.setItem('ssc-view', choice); // 套用於特價頁
    markActive('view-seg', 'data-view-choice', choice);
  });
}

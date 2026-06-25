import { initTheme, setTheme, storeTheme, storedThemeChoice } from './theme';
import { resolveTheme, type Theme, type ViewMode } from './view';
import { getLang, dict, applyI18n } from './i18n';

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
}

import zhTW from '../i18n/zh-TW.json';
import en from '../i18n/en.json';

export type Dict = typeof zhTW;
const DICTS: Record<string, Dict> = { 'zh-TW': zhTW, en };

export function getLang(): 'zh-TW' | 'en' {
  return localStorage.getItem('ssc-lang') === 'en' ? 'en' : 'zh-TW';
}
export function dict(): Dict {
  return DICTS[getLang()];
}

// 套用 data-i18n(textContent)、data-i18n-ph(placeholder)、data-i18n-aria(aria-label)。
export function applyI18n(t: Dict): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n as keyof Dict;
    if (t[k]) el.textContent = String(t[k]);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-ph]').forEach(el => {
    const k = el.dataset.i18nPh as keyof Dict;
    if (t[k]) (el as HTMLInputElement).placeholder = String(t[k]);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach(el => {
    const k = el.dataset.i18nAria as keyof Dict;
    if (t[k]) el.setAttribute('aria-label', String(t[k]));
  });
}

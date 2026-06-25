import { resolveTheme, type Theme } from './view';

// 共用主題套用邏輯,供首頁(app.ts)與設定頁(settings.ts)重用。

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

// 讀 localStorage('ssc-theme';空=跟隨系統)→ 套用 → 回傳實際採用的主題。
export function initTheme(): Theme {
  const t = resolveTheme(localStorage.getItem('ssc-theme'), window.matchMedia('(prefers-color-scheme: dark)').matches);
  setTheme(t);
  return t;
}

// 'system' = 清除偏好(跟隨系統);'dark'/'light' = 明確存。
export function storeTheme(choice: Theme | 'system'): void {
  if (choice === 'system') localStorage.removeItem('ssc-theme');
  else localStorage.setItem('ssc-theme', choice);
}

// 目前儲存的偏好(供設定頁三選一顯示);未設回 'system'。
export function storedThemeChoice(): Theme | 'system' {
  const v = localStorage.getItem('ssc-theme');
  return v === 'light' || v === 'dark' ? v : 'system';
}

import { test, expect } from "@playwright/test";

// 與內容解耦的通用斷言:改文案/資料不會讓測試脆弱誤紅。
test("首頁可載入且結構正確", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.ok(), "首頁應回應 2xx").toBeTruthy();
  await expect(page).toHaveTitle(/Steam/);
  await expect(page.locator("main.wrap")).toBeVisible();
  await expect(page.locator("h1").first()).toBeVisible();
});

test("行動版 viewport 無明顯水平溢出", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "行動版不應出現明顯水平捲動(破版)").toBeLessThanOrEqual(2);
});

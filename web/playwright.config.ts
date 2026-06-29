import { defineConfig } from "@playwright/test";

// 最小 e2e / smoke:對 astro build 後的靜態產物(dist/,由 `astro preview` 提供)驗證。
// 補足 CI 既有的 vitest 單元測試 + 型別/build:那些保證「邏輯對、build 得起來」,
// 這裡保證「首頁畫面真的載得起來、不破版」。
const PORT = 4321;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL },
  webServer: {
    command: `npm run preview -- --port ${PORT} --host`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

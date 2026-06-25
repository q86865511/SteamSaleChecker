# PROGRESS — SteamSaleChecker

## 目前狀態
公開站(含價格圖、About)已在 GitHub `main`。**Discord 帳號 + 願望清單**(分支 `feat/discord-wishlist`)程式已完成、本機整合驗證通過(API `/health`、`/api/me` 401、OAuth 重導帶 client_id+CSRF state、CORS、未登入 localStorage 收藏),只剩**使用者跑一次真實 Discord 登入**驗證 + 開 PR。

## 已完成
- **2026-06-25:Discord 帳號 + 願望清單(Plan 2,分支 `feat/discord-wishlist`,待 PR)**
  - 新 `api/` workspace(Fastify + @fastify/secure-session + cors + better-sqlite3),共用 `data/steam.db` 新增 `users`/`wishlist` 表。
  - 路由:`/health`、`/api/me`、`/api/wishlist` GET/POST/DELETE/merge(需登入,401 守門)、`/auth/discord`、`/auth/callback`(CSRF state)、`/auth/logout`;`upsertUser`。
  - 前端:Discord 登入/登出鈕、卡片 ★ 收藏(未登入 localStorage、登入打 API、登入時合併 localStorage)。
  - 測試 29 綠(資料層、buildAuthorizeUrl、upsert、路由守門 inject);本機整合驗證 API/CORS/OAuth 重導/localStorage 收藏皆通過。
  - 待:使用者完成一次真實 Discord 登入(需 `api/.env` 填 client id/secret + Discord 後台加 redirect)。
- **2026-06-25:公開站加分項(分支 `feat/public-site-polish`,待 PR)**
  - worker 烤單款價格歷史 `web/public/data/history/<appid>.json`(`getPriceHistory`,TDD)。
  - 前端 uPlot:點任一特價卡開 modal 看價格走勢圖(史低參考線、冷啟動「累積中」誠實提示)。
  - About 技術說明段(i18n,給 recruiter);免費卡顯示 giveaway 價值(`worthUsd`)。
  - 18 TDD 測試綠;本機驗證 About 渲染、點 Cyberpunk 開圖成功(canvas + uPlot)。
- **2026-06-25:公開站推上 GitHub** — https://github.com/q86865511/SteamSaleChecker(private,`main`)。
- **2026-06-25:公開站完整實作(P0–P2,plan Tasks 0–15)**
  - monorepo(npm workspaces:`shared` / `worker` / `web`)+ TS + vitest + tsx。
  - `shared`:幣別/折扣、創新低判斷、GamerPower 解析、Steam 解析等純函式,**TDD,17 測試全綠**。
  - `worker`:SQLite(better-sqlite3,WAL)價格歷史 + `observed_low` 維護;Steam `featuredcategories`/`appdetails`/特價搜尋分頁(`infinite=1`,熱銷排序)+ GamerPower 永久入庫;原子寫 `deals/free/meta.json`;失敗續供舊檔。
  - **P0 實測通過**:`featuredcategories?cc=tw` 回**台幣**(Cyberpunk NT$1,599→NT$479,-70%);GamerPower `.` 分隔有效、11 款永久入庫。
  - `web`:Astro 靜態站,client 端 `fetch /data/*.json`(資料更新免重 build),深色電競主題、i18n(zh-TW/en)、即將結束區、資料新鮮度、GamerPower 歸屬。
  - 本機驗證:渲染 40 特價 + 7 即將結束 + 11 免費,熱銷排序、台幣價、「本站最低」徽章正確,無 console 錯誤。

## 進行中
- (無)

## 待辦
- **Plan 3:Discord 降價通知**(bot 專區頻道 @提醒、`notifications` 防重複、`guilds.join`)。
- **Plan 4:部署**(systemd worker timer + API service、nginx 反代、子站路徑、履歷連結)。
- 一次性 ITAD 史低 seed:腳本已備(`worker/src/seed/itad-seed.ts`),上線前手動跑;需先實測 `country=TW` 是否回台幣(需使用者提供 ITAD key)。

## 已知問題
- 「史低」目前為**冷啟動**狀態:第一次觀測即視為最低,故多數顯示「本站最低」。屬預期行為,文案誠實標「追蹤以來最低」;隨時間累積(或跑 ITAD seed)才逼近真正史低。
- Steam 未公開端點有 per-IP 節流(~200 req/5min);`appdetails` 已節流 ~1 req/s + 退避。
- `npm audit` 有數個 Astro/vitest 鏈的 dev 相依告警(非 production 暴露)。

## 重要決策紀錄
- **史低自建、不在 production 依賴 ITAD**:Steam 官方無歷史價;改自記每次台幣價。ITAD 僅作上線前「一次性 seed」(可選)。
- **特價榜以熱銷為主、儘量完整**:用 Steam 特價搜尋 `infinite=1&filter=topsellers` 分頁取 appid(實測 `json=1` 無 appid,必須用 `infinite=1`),再 `appdetails` 補台幣價;`featuredcategories` 為 fallback。
- **免費只做「永久入庫」**:免費周末/限免試玩無乾淨 API,不做;倒數=領取期限。
- **架構**:公開瀏覽=靜態 JSON(快、穩);帳號/通知另起 API 服務 + bot(後續子系統)。
- **資料與前端解耦**:worker 烤 JSON,前端 client 端 fetch,資料更新免重 build。
- **技術選型**:後端 Node + TS + better-sqlite3(WAL);前端 Astro;由助理選定。

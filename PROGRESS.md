# PROGRESS — SteamSaleChecker

## 目前狀態
公開站(MVP 第一子系統)已完成並在本機驗證通過:後端排程抓 Steam/GamerPower、自建價格歷史、烤 JSON;前端 Astro 渲染熱門特價榜、即將結束、免費領取,深色主題 + 繁中/英切換。目前在分支 `feat/public-site`,尚未 push / 開 PR。

## 已完成
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
- **Plan 2:Discord 帳號 + 願望清單**(`api/` Fastify、OAuth2、session、`/api/wishlist`、localStorage 合併、站內收藏高亮)。
- **Plan 3:Discord 降價通知**(bot 專區頻道 @提醒、`notifications` 防重複、`guilds.join`)。
- **Plan 4:部署**(systemd worker timer + API service、nginx 反代、子站路徑、履歷連結)。
- 價格走勢圖:需 worker 另烤「單款價格歷史 JSON」後,前端以 uPlot 繪製(MVP 暫緩)。
- 一次性 ITAD 史低 seed:腳本已備(`worker/src/seed/itad-seed.ts`),上線前手動跑;需先實測 `country=TW` 是否回台幣。
- About / 技術說明段(作品集展示)。

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

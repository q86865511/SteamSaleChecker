# PROGRESS — SteamSaleChecker

## 目前狀態
**已正式上線:https://steam.terrychou.com** —— Oracle 主機上 Docker(api:8788 + worker)+ Caddy(`steam.terrychou.com` 站)+ Cloudflare Tunnel,完全貼合既有 soulshard 架構;terrychou.com / soulshard 不受影響。線上有 119 筆特價 + 11 免費、Discord 登入(prod redirect)、bot 上線、降價通知皆通。剩 CI/CD 自動部署(GitHub Actions ssh-action)merge 後驗證。

## 已完成
- **2026-06-25:Phase C 通知包(`feat/notify-pack`,待 PR 審查)**
  - **免費領取 Discord 通知**:啟用閒置的 `free_giveaways` 表(遷移加 `first_seen`/`notified`/`notified_at`);首輪建立基線不通知,之後僅對新出現的 giveaway 發頻道公告(重用 `postChannelMessage`)。
  - **每日/每週特價摘要**:新 `report_gates` 表 + 重用 `shouldRefresh` gating;`formatDigest` 取折扣 Top N;`SSC_DIGEST_HOURS`(0=停用、24=每日、168=每週)控制,**預設停用**(需手動開)。
  - 純函式 `formatGiveawayMessage`/`formatDigest` 與 DB 狀態皆 TDD(**95 測試**綠);通知失敗不影響主流程。
  - **目標價通知改排 Phase B**:其設定 UI 需依賴 Phase B 的收藏/詳細頁,與該頁一起做較合理。
- **2026-06-25:Phase A 前端體驗包(`feat/frontend-pack`,PR #9 已 merge、部署 live)**
  - **icon/PWA/OG**:`web/public/favicon.svg`(降價長條品牌標)+ `manifest.webmanifest` + `Base.astro` head 加 favicon/manifest/theme-color/OG/twitter。
  - **設定頁** `web/src/pages/settings.astro` + `settings.ts`:主題(跟隨系統/深/淺)、語言、預設檢視集中;抽出共用 `theme.ts`/`i18n.ts` 供首頁與設定頁重用;header 加齒輪連結。
  - **即時特價倒數**:`view.ts` 純函式 `fmtCountdown`(TDD);列表加「倒數」欄、卡片顯示倒數,`setInterval` 每秒跳動、到期標「已結束」(僅 featured 來源有 expiration)。
  - **基本清單篩選**:`applyFilters` 純函式(TDD);toolbar 加最低折扣/最高價/「只看 ≤ 史低」。
  - 驗證:**86 測試**綠、build(2 頁)通過、web tsc 乾淨、i18n zh/en 同步;Preview 實測 head/設定頁三選一(含跟隨系統)/倒數跳動/篩選(折扣 75→28、at-low→100)/回歸全通過。
  - 本批是 brainstorm roadmap(A→C→B→D)的第一棒;roadmap 見 `~/.claude/plans/1-icon-*.md`。
- **2026-06-25:前端 SteamDB 風格改版(`feat/steamdb-redesign`,PR #8 已 merge、已部署 live)**
  - 純邏輯層 `web/src/scripts/view.ts`(filter/sort/applyView/resolveTheme/nextSortDir/fmtLowDate/readChartPalette),**23 TDD 測試**綠;`Deal` 型別移此。
  - 熱門特價榜改 SteamDB 風**緊湊可排序列表**(縮圖/遊戲/折扣/特價/原價/狀態/史低日期/★)+ sticky toolbar;**卡片⇄列表**切換(localStorage 持久)。
  - **亮色主題**(`[data-theme=light]` 整套 CSS 變數 + `--heading`,跟隨 prefers-color-scheme),header 切換鈕持久;uPlot 圖表配色隨主題重繪。
  - **單款搜尋**(對 nameZh 即時過濾、no-results 狀態、重渲染不丟焦點)。
  - 修正:wish ★ 同步該遊戲所有實例(熱門榜 + 即將結束區)。
  - 驗證:**75 測試**綠、build 通過、i18n zh/en 同步;Preview 實測搜尋/排序/卡列切換/深淺主題/圖表/收藏/RWD 全通過(此環境 screenshot 工具不可用,改以 snapshot/inspect/eval 驗證)。
- **2026-06-25:ITAD 史低每日刷新 + 正式站金鑰(`feat/itad-daily`)**
  - 抽出共用模組 `worker/src/seed/itad.ts`(`shouldRefresh` 純函式 + `seedItadLows` 編排),CLI `itad-seed.ts` 改薄包裝;gate 5 測試 + 解析 12 測試綠。
  - worker 每輪結束做 gated 每日刷新(`SSC_ITAD_REFRESH_HOURS` 預設 24h;有 `ITAD_API_KEY` 才跑;失敗不影響主流程;效果下一輪重烤反映)。
  - 正式站金鑰:與 Discord 祕密一致,放主機 `api/.env`(gitignore,`git reset` 不覆蓋),worker 經 `env_file` 取得;有 key 即每日自動刷新,未設則略過。
- **2026-06-25:後端小修(`feat/backend-fixes`)**
  - discord.js `ready` → `clientReady`(`api/src/presence.ts`):消棄用警告;lockfile 確認解析版本 14.26.4 已支援 `clientReady`。
  - ITAD seed 強化(TDD):抽出純函式 `parseStoreLows`(保留 currency + 史低 timestamp,優先用 `amountInt` 避免浮點誤差),12 測試綠;lookup/storelow 加重試退避;`--check` 乾跑;dotenv 讀 `api/.env`;幣別驗證(非 TWD 警示)。
  - seed 也誠實改寫 `observed_low_at` 為真實史低日期(僅在 seeded 史低成為/追平最低且有 timestamp 時)。
  - **本機實跑驗證**:ITAD **API Key**(非 OAuth secret)有效;**119/119** 對應 ITAD id、**115** 款史低、幣別**全為 TWD**(`country=TW` 確認回台幣);寫入 115 款 `game_stats`(例:Batman NT$133 @ 2024-12-19)。重烤後 `deals.json` 反映新史低:19 款由冷啟動誤判「本站最低」修正為實際高於史低。
- **2026-06-25:Plan 4 部署上線(`feat/deploy`)**
  - 容器化:`Dockerfile`(node:22)+ `docker-compose.yml`(api:8788 + worker loop,sqlite volume,bind `/srv/steam/data`)+ `.dockerignore`。
  - prod 設定:cookie `secure` 讀 `COOKIE_SECURE`;`api/.env` 線上值(redirect/origin = `https://steam.terrychou.com`)。
  - 主機:clone repo、web build → `/srv/steam`、`docker compose up`(api health + worker 寫資料)。
  - 接線(只新增、不動現有站):Caddy 加 `steam.terrychou.com` 區塊(validate→reload)、cloudflared 加 ingress + DNS route(restart)。三站對外皆 200。
  - CI/CD:`.github/workflows/deploy.yml`(`appleboy/ssh-action`,push main → git reset + build + `compose up --build` + health);secrets `OCI_HOST/USER/SSH_KEY` 已設、deploy 公鑰已裝主機。
  - **live 驗證**:`https://steam.terrychou.com` 119 特價 + 11 免費、`/auth/discord` prod redirect、`/api/me` 401、bot 上線。
- **2026-06-25:live 真機驗證 + bot 上線**
  - 用真實帳號 `ye_ye8555` 跑通:Discord 登入 → ★ 收藏(Cyberpunk、潛水員戴夫)→ bot @你 降價通知 2/2 送出 → 再跑去重變 0(防轟炸)。
  - Plan 2(登入/收藏)與 Plan 3(通知)皆 live 驗證通過。
  - `feat/bot-presence` 分支:api 啟動時用 discord.js 連 Gateway,bot 顯示**上線**(Watching Steam 特價);`ready` 事件 v15 要改 `clientReady`(目前 v14 仍可、僅 deprecation 警告)。
- **2026-06-25:Discord 降價通知(Plan 3,PR #3 已 merge)**
  - worker db 加 `notifications` 表 + `getWishersForApp`/`alreadyNotified`/`markNotified`(TDD)。
  - `discord-bot.ts`:`formatNotifyMessage`(TDD)+ `postChannelMessage`(REST,`allowed_mentions` 只 parse users)。
  - `notify.ts`:`collectPending`(找收藏者、去重)+ `dispatchNotifications`(成功才標記、失敗下次重試)。
  - pipeline 只蒐集「跌破先前已記錄最低」的 meaningful new low(排除首次觀測,避免首日洗頻)。
  - worker 載入 `api/.env`,有 `DISCORD_BOT_TOKEN`+`DISCORD_NOTIFY_CHANNEL_ID` 才發、否則略過;空字串 env 穩健回退。
  - api 登入加 `guilds.join` scope + `addGuildMember`(非致命,自動把人加進伺服器)。
  - 35 測試綠;待使用者填 bot token / guild id / channel id 做真實通知測試。
- **2026-06-25:Discord 帳號 + 願望清單(Plan 2,PR #2 已 merge)**
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

## 待辦(功能擴充 roadmap,依序;見 `~/.claude/plans/1-icon-*.md`)
- ~~Phase A 前端體驗包~~:✅ PR #9 已 merge。
- **Phase C 通知包**:免費通知 + 每日/每週摘要已完成,待 PR 審查 merge(目標價通知移至 Phase B)。
- **Phase B 資料加值 + 詳細頁**:評價 + 豐富 appdetails(介紹/截圖/類型)+ 商品詳細頁(取代圖表 modal、修鍵盤可達性)+ 全收藏頁 + sparkline + 類型篩選 + **目標價通知**(自 C 移入)。
- **Phase D**:Steam 願望單匯入。

## 已知問題
- 「史低」冷啟動:第一次觀測即視為最低。已接 **ITAD 每日刷新校正**(本機已驗證;**正式站於部署後 worker 首輪自動 seed**,之後每日刷新)。文案仍誠實標「追蹤以來最低」。
- Steam 未公開端點有 per-IP 節流(~200 req/5min);`appdetails` 已節流 ~1 req/s + 退避。
- `npm audit` 有數個 Astro/vitest 鏈的 dev 相依告警(非 production 暴露)。

## 重要決策紀錄
- **史低自建 + ITAD 每日校正**(2026-06-25 修訂):Steam 官方無歷史價,主軸仍是自記每次台幣價;另以 ITAD **每日刷新**校正「史低參考值」(gated by `ITAD_API_KEY`,失敗不影響主流程,**不污染** `price_history` 走勢)。早期決策為「僅上線前一次性 seed」,因使用者需求改為常駐每日刷新。
- **特價榜以熱銷為主、儘量完整**:用 Steam 特價搜尋 `infinite=1&filter=topsellers` 分頁取 appid(實測 `json=1` 無 appid,必須用 `infinite=1`),再 `appdetails` 補台幣價;`featuredcategories` 為 fallback。
- **免費只做「永久入庫」**:免費周末/限免試玩無乾淨 API,不做;倒數=領取期限。
- **架構**:公開瀏覽=靜態 JSON(快、穩);帳號/通知另起 API 服務 + bot(後續子系統)。
- **資料與前端解耦**:worker 烤 JSON,前端 client 端 fetch,資料更新免重 build。
- **技術選型**:後端 Node + TS + better-sqlite3(WAL);前端 Astro;由助理選定。

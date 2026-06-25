# PROGRESS — SteamSaleChecker

## 目前狀態
**已正式上線:https://steam.terrychou.com** —— Oracle 主機上 Docker(api:8788 + worker)+ Caddy(`steam.terrychou.com` 站)+ Cloudflare Tunnel,完全貼合既有 soulshard 架構;terrychou.com / soulshard 不受影響。線上有 119 筆特價 + 11 免費、Discord 登入(prod redirect)、bot 上線、降價通知皆通。剩 CI/CD 自動部署(GitHub Actions ssh-action)merge 後驗證。

## 已完成
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

## 待辦
- **前端 SteamDB 風格改版(PR2)**:緊湊可排序列表 + 卡片/列表切換 + 亮色主題 + 單款搜尋(見計畫)。
- **正式站 ITAD 史低 seed(可選)**:本機已驗證並 seed;正式站 DB 在主機 Docker volume,需於主機 `docker compose exec worker npm -w @ssc/worker run seed`(`api/.env` 含 `ITAD_API_KEY`)後等下一輪 worker 重烤。平時 runtime 不需 ITAD。

## 已知問題
- 「史低」冷啟動:第一次觀測即視為最低。**本機已跑 ITAD seed**(2026-06-25),本機史低已為真實值並標真實日期;**正式站尚未 seed**,仍為冷啟動,待主機手動執行(見待辦)。文案誠實標「追蹤以來最低」。
- Steam 未公開端點有 per-IP 節流(~200 req/5min);`appdetails` 已節流 ~1 req/s + 退避。
- `npm audit` 有數個 Astro/vitest 鏈的 dev 相依告警(非 production 暴露)。

## 重要決策紀錄
- **史低自建、不在 production 依賴 ITAD**:Steam 官方無歷史價;改自記每次台幣價。ITAD 僅作上線前「一次性 seed」(可選)。
- **特價榜以熱銷為主、儘量完整**:用 Steam 特價搜尋 `infinite=1&filter=topsellers` 分頁取 appid(實測 `json=1` 無 appid,必須用 `infinite=1`),再 `appdetails` 補台幣價;`featuredcategories` 為 fallback。
- **免費只做「永久入庫」**:免費周末/限免試玩無乾淨 API,不做;倒數=領取期限。
- **架構**:公開瀏覽=靜態 JSON(快、穩);帳號/通知另起 API 服務 + bot(後續子系統)。
- **資料與前端解耦**:worker 烤 JSON,前端 client 端 fetch,資料更新免重 build。
- **技術選型**:後端 Node + TS + better-sqlite3(WAL);前端 Astro;由助理選定。

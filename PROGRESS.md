# PROGRESS — SteamSaleChecker

## 目前狀態
**已正式上線:https://steam.terrychou.com**(Oracle Docker + Caddy + Cloudflare Tunnel)。**roadmap A→D 全完成,R5/R6/R7 皆已合併並部署**(R6=PR #20、R7=PR #22)。**軌道 2a 工程硬化(PR #23)已 merge + 部署 + prod 親驗通過**(helmet 安全標頭 + rate-limit + trustProxy 依真實 IP 分桶)。**R7 邀請機器人/頻道路由已真機驗證**(主機/DB 證實 Ops 上線、邀請成功登記、測試通知落地);**R6 rich embed 真機驗證**時發現「降價 embed 用小縮圖、與免費/digest 大圖版面不一致」,已修(`thumbnail`→`image`,TDD)。**255 測試綠**、四 workspace tsc 乾淨。**下一階段四軌**:① 收尾 R7/R6(本批 `chore/r7-r6-closeout`)② 工程硬化(2a 已完成、2b 補測試待做)③ 多平台免費源 ④ 通知體驗(計畫檔 `~/.claude/plans/zesty-toasting-wilkes.md`)。

## 已完成
- [2026-06-29] 🔒 依賴安全大升級 + CI/deploy 拆分 + e2e smoke(分支 `chore/split-ci-add-e2e`,待 PR):**外部稽查交接稿誤報「0 漏洞」,實際 `npm audit` 有 20 個(1 critical、8 high、11 moderate)**。全數修復:
  - **major 升級**:`fastify ^4→^5.9`(連 `@fastify/cors ^9→^11`、`@fastify/helmet ^11→^13`、`@fastify/rate-limit ^9→^10`、`@fastify/secure-session ^7→^8`)、`astro ^4→^7`、`vitest ^2→^4`、`discord.js ^14.16→^14.26`;root `overrides: undici ^6.27.0`(修 discord.js 內嵌 undici 6.24 的 4 個漏洞,同 major API 相容)。
  - **CI 拆分**:新增 `ci.yml`(PR/push 跑 `typecheck → 單元測試 → web build → e2e smoke`),`deploy.yml` 移除 test job 與 PR 觸發、**只負責部署**。
  - **e2e smoke**:`web/` 加 `@playwright/test`(用 `astro preview` 服務 dist,免額外靜態伺服器),`web/e2e/smoke.spec.ts` 驗首頁載入 + 行動版不破版;root 加 `typecheck` script(四 workspace tsc)。
  - **驗收**:`npm audit` **20→0**;`npm test` **297 passed**(vitest 4);四 workspace typecheck 綠;`astro build` 4 頁綠;Playwright e2e 2 passed。README 徽章/測試/部署/已知限制章節同步(Astro 7.x、Fastify 5.x、測試數、CI 拆分)。
- [2026-06-27] 🔔 軌道 4a 分類摘要(分支 `feat/categorized-digest`,待 PR):`buildDigestEmbed` 由單一 flat 清單改為**依主要類型(第一個 genre)分區成 embed fields**;類型區依其最高折扣排序(最熱在前)、組內折扣高→低、無類型歸「其他」;沿用 topN 取樣與榜首封面。TDD:`embeds.test.ts` digest 斷言改 fields(分區/排序/其他/topN 跨區合計);preview 腳本合成 digest 加類型以展示分區。**297 測試綠**、worker tsc 乾淨。(4b Email 備援仍待拍板)
- [2026-06-27] 🎮 軌道 3 多平台免費源(PR #26 已 merge、部署 live、Preview 實測):放寬 `shared/src/gamerpower-parse.ts` 的 `keepForeverGame`——去掉 `isSteamGiveaway` 強制,改收所有「Active 的 Game/DLC」(GamerPower 早已抓 `epic-games-store.gog`,只是被擋掉),`isSteamGiveaway` 保留供徽章。前端免費卡平台 pill 加品牌色(`view.ts` 純函式 `platformClass`:Steam 藍/Epic 金/GOG 紫,TDD)。**Preview 實測**:重烤後免費區由 Steam-only → 12 張含 Epic(Voidwrought/RollerCoaster Tycoon)、IndieGala/DRM-Free,Epic pill 金色 `#d6a23a`、Steam 藍、其餘灰;無 console 錯誤、web build 4 頁過。**294 測試綠**、web tsc 乾淨。README 免費段/資料來源表更新為多平台。
- [2026-06-27] 🧪 軌道 2b 補測試(後端;PR #25 已 merge):
  - `api/src/db.test.ts`(+29):in-memory sqlite 測 users/wishlist/targets/user_bot_guilds CRUD、migration 冪等、`getNotifPrefs` 預設與 delivery 防禦(未知→channel)、純函式 `mergeGuildRouting`(null=清除 vs undefined=保留的關鍵區分)、`putNotifPrefs` 部分合併與 genres 取代/保留。
  - `api/src/auth.test.ts`(+8):mock `./discord` 網路呼叫,走真實 `/auth/discord`→state+cookie→`/auth/callback` 完整 OAuth/CSRF flow——happy path 建使用者+設 session+`/api/me` 取回、state 不符 400、缺 code/state 400、exchangeCode 失敗 502、addGuildMember 失敗非致命、user 被刪 401、logout 清 session。
  - **292 測試綠**(255→+37)、api tsc 乾淨。web 前端腳本(需 jsdom)留作 2b 後續。
- [2026-06-27] ✅ 軌道 1 收尾 R7/R6 + R6 embed 版面修正(PR #24 已 merge、部署 live、真機驗證版面):
  - **R7 真機驗證**:`ssh oracle` 確認主機 `.env` 與運行容器都有 `DISCORD_BOT_INVITE_REDIRECT_URI`(Ops 上線);DB `user_bot_guilds` 證實使用者昨天成功把 bot 邀進自管伺服器(擁有權驗證有通過);`/settings` 選頻道 + 測試通知落地。
  - **R6 真機驗證**:以 `preview-embeds.ts` 發 4 型 embed 到頻道肉眼比對。發現**降價/目標價 embed 用 `thumbnail`(小縮圖),與免費/digest 的 `image`(大圖)版面不一致**。
  - **修正**(TDD):`buildDropEmbed` 改用 `embed.image` 大圖封面、與其他通知一致;`embeds.test.ts` 斷言改 `image`;preview 腳本 drop 傳 `mentionText:''` 不再顯示假的 `<@0>`。**255 測試綠**、worker tsc 乾淨。
  - 文件同步:本檔 + 記憶 + README 環境變數/CI 段(隨 2a)。
- [2026-06-27] 🛡️ 軌道 2a 工程硬化(PR #23 已 merge=commit `fa90e58`、部署 live、prod 親驗通過):
  - **CI 測試門檻**:`.github/workflows/deploy.yml` 新增 GitHub-runner `test` job(`npm ci` + `npm test`,Node 22),`deploy` 加 `needs: test`,**測試不過即擋部署**(原本 CI 從不跑測試)。
  - **API 安全硬化**(`api/src/server.ts`):註冊 `@fastify/helmet`(安全標頭;API 無 HTML 故關 CSP、CORP 設 cross-origin)+ `@fastify/rate-limit`(每 IP 預設 100/分、`SSC_RATE_LIMIT_MAX` 可調、超量 429);`Fastify({ trustProxy: true })` 讓 Caddy/Cloudflare 後面能依真實 client IP 分桶。
  - TDD:`api/src/server.test.ts` +2 整合測試(nosniff/x-frame-options 標頭、超量 429);**255 測試綠**、api tsc 乾淨。
- [2026-06-26] 🤖 R7 per-user 邀請機器人 + 伺服器/頻道路由(PR #22 已 merge=`dcea347`;真機驗證通過 2026-06-27):設定頁新增「Discord 伺服器通知」區——使用者可把官方機器人邀請進**自己的伺服器**、選伺服器與頻道(預設統一、可切「分流」讓降價/免費/摘要各送不同頻道)、設提及方式(不提及 / @我 / @身分組)、看連線狀態、發測試通知、移除連線。後端新增 `delivery='guild'` 與 `notif_prefs` 路由欄 + `user_bot_guilds` 表;`/api/bot/*` 路由(invite/callback/guilds/channels/roles/test/disconnect)。**安全要點(對抗式 review 抓到並修)**:邀請 callback 的 `guild_id` 可偽造,故用 `scope=bot guilds`+換 code+`/users/@me/guilds` 驗使用者真有該 guild 管理權才登記;寫入路由前用 bot token 即時驗證頻道/身分組歸屬;allowed_mentions 最小白名單。worker 路由解析抽成純函式 `worker/src/route.ts`;`postChannelMessage` 支援精準 mention 白名單;embeds 加 `mentionText`;順手修 `getNotifPrefs(ForUser)` 把 `'guild'` 直通(原 ternary 會吃成 channel)。**+43 測試(253 綠)**;Preview 實測設定頁(深/淺、統一/分流、@身分組)版面正確並修一個 `.set-row[hidden]` CSS bug。
- [2026-06-26] 🎨 R6 Discord 通知改 Steam 商店風 rich embed(PR #20 已 merge;真機驗證 2026-06-27,降價 embed 版面修正見上):4 型通知(免費公告/個人免費/降價·目標價/特價 digest)純文字→embed(`inline-code` chip/Discord `<t:>` 領取倒數/封面圖/link button/footer);傳輸層 `postChannelMessage`·`sendDm` 改吃 `string|MessagePayload`,排版抽到純函式 `worker/src/embeds.ts`(TDD)。免費完整版用 `searchSteamAppid`(storesearch 以標題解析、正規化相等才套用、快取 `free_giveaways.appid`)補評價·原價封面,贈送一律框「免費領取」(不沿用 Steam 現價),對不到/非 Steam 退精簡版;降價·digest 重用既有 `games`/`game_reviews`/`Deal` 補強不增 Steam 請求。**對抗式多代理 review 修 8 項**(appid 查詢失敗不毒化快取、embed 256/4096 截斷、chip 反引號淨化、parseEndDate 範圍驗證、enrich 封面 isHttp 守、本輪 appdetails 共用快取、平台解析改用 `parsePlatforms`)。**210 測試綠**、worker tsc 乾淨;新 `scripts/preview-embeds.ts` 以真實 Steam 資料肉眼比對。
- [2026-06-26] 📄 文件:README 改寫為作品集風格(對齊 Soulshard 風,加徽章/TOC/Mermaid/技術亮點/已知限制/文件索引)+ 新增 `docs/architecture.svg` 架構圖 + MIT `LICENSE`
- [2026-06-26] 🧪 R5.7 對抗式review修2bug+5小修
- [2026-06-26] 🌐 R5.6 Steam願望單匯入
- [2026-06-26] 🌐 R5.5 通知偏好子系統
- [2026-06-26] 🌐 R5.4 免費濾Steam/史表清理
- [2026-06-26] 🖥️ R5.3 倒數標示/設定a11y/PWA圖
- [2026-06-25] 🌐 R5.2 收藏目標價通知
- [2026-06-25] 🖥️ R5.1 列內走勢圖/類型篩選
- **2026-06-25:Phase B-3 全收藏頁(`feat/favorites`,待 PR 審查)**
  - worker:enrich 時把遊戲名/封面/原價持久化進 `games` 表(原本閒置)+ 烤 `games-index.json`(LEFT JOIN game_stats 帶史低);收藏的遊戲即使目前沒特價也能顯示。TDD `upsertGame`/`gamesIndex`。
  - 新 `/favorites` 頁:登入感知載入收藏 → 比對 deals(現價/折扣)+ games-index(名/圖/史低)渲染卡片、★ 即時移除、連到 `/game`;header 加 ♥ 連結。
  - **104 測試**綠、build 4 頁、worker/web tsc 乾淨、i18n 同步(68 keys)。
- **2026-06-25:Phase B-2 商品詳細頁(`feat/game-detail`,PR #12 已 merge、部署 live)**
  - worker:`appdetails` filter 擴充(短介紹/類型/上市日/截圖;`parseAppDetails` TDD)→ 烤 `detail/{appid}.json`(deal 價格/史低/評價 + 豐富欄位),**不增加 Steam 請求數**(沿用既有 enrich)。
  - 新 `web/src/pages/game.astro` + `game.ts`:`/game?appid=` client fetch detail + history,顯示封面/價格/折扣/即時倒數/評價/史低/Steam 連結/價格走勢圖(主題感知)/介紹/類型/上市日/截圖。
  - **取代圖表 modal**:列表/卡片點擊改導向 `/game`;遊戲名稱改 `<a>` 連結(**修好鍵盤可達性**);移除 index modal。
  - **103 測試**綠、build 3 頁、worker/web tsc 乾淨、i18n 同步(64 keys)。
- **2026-06-25:Phase B-1 遊戲評價(`feat/game-reviews`,PR #11 已 merge)**
  - Steam `appreviews` 摘要抓取(`parseReviewSummary` 純函式 TDD)→ `game_reviews` 表(gated:每輪最多 30 款過期 >24h、節流 ~1/s)→ 烤進 `deals.json` 的 `review`{scoreDesc/positivePct/total};`l=tchinese` 取繁中評語。
  - 前端:列表加「評價」欄、卡片顯示 👍 正評%(依正評率著色),hover 顯示評語 + 總評數。
  - **100 測試**綠、worker/web tsc 乾淨、i18n 同步;Phase B 第一塊。
- **2026-06-25:Phase C 通知包(`feat/notify-pack`,PR #10 已 merge)**
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
- **軌道 1 收尾 R7/R6**(分支 `chore/r7-r6-closeout`,待 push/PR/merge)— R7/R6 已真機驗證、R6 降價 embed 版面已修;待合併部署後重發 preview 給使用者確認大圖版面。

## 待辦(下一階段四軌 roadmap,依序;計畫檔 `~/.claude/plans/zesty-toasting-wilkes.md`)
- ✅ **軌道 1 收尾 R7/R6**:見「## 進行中」。
- **軌道 2 工程品質硬化**:✅ 2a(CI 測試門檻 + API helmet/rate-limit,PR #23 已 merge);🧪 2b 後端覆蓋(`api/db.ts`+29、`api/auth.ts`+8,`test/api-coverage-2b` 待 PR);⏳ 2b 後續 `web/scripts/` 純邏輯(需 jsdom)、可選 prettier。
- ✅ **軌道 3 多平台免費源(Epic/GOG)**:放寬 `keepForeverGame` + 前端品牌色平台徽章(`feat/multi-platform-free`,待 PR;Preview 實測通過)。
- **軌道 4 通知體驗**:✅ 4a 分類摘要(`buildDigestEmbed` 依類型分區,`feat/categorized-digest` 待 PR);⏳ 4b Email 備援(待拍板:`NotifDelivery` 加 `'email'`、OAuth `email` scope、Resend/SES)。註:個人化摘要依類型過濾已做好。

### 舊功能 roadmap(A→D,已全數完成)
- ~~Phase A 前端體驗包~~:✅ PR #9 已 merge。
- ~~Phase C 通知包~~:✅ PR #10 已 merge(目標價通知移至 Phase B)。
- **Phase B 資料加值 + 詳細頁(進行中,拆小 PR)**:
  - ✅ B-1 遊戲評價(PR #11 已 merge)。
  - ✅ B-2 商品詳細頁 `/game`(PR #12 已 merge)。
  - ✅ B-3 全收藏頁(PR #13 已 merge)。
  - ✅ B-4 sparkline+類型篩選 / ✅ B-5 目標價 / ✅ 小尾巴+2bug / ✅ 通知設定 per-user 偏好 — **R5 批次已合併 main 並部署 live**(PR #14 merged、#15–#18 內容隨整鏈快進進 main)。
  - 註:per-game OG 分享需 SSR/預產,與「靜態 + query param client fetch」不相容,故詳細頁沿用站台通用 OG(client 端僅改 document.title)。
- ✅ **Phase D**:Steam 願望單匯入(R5 批次,已合併部署)。

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
- **per-user 邀請機器人走「bot 邀請」而非 webhook**(2026-06-26):使用者要的是把官方機器人邀進自己伺服器、選頻道,故沿用既有 bot(非 webhook)。**關鍵安全決策**:Discord 邀請 callback 帶回的 `guild_id` 官方明載「可被偽造,只能當 hint」,絕不可直接當擁有權白名單;改用 `scope=bot guilds`(純 `scope=bot` 是 callback-less 不會回跳)+ 換 code + 以使用者 token 打 `/users/@me/guilds` 確認其 owner 或具 `MANAGE_GUILD` 才登記到 `user_bot_guilds`。之後所有 guild-scoped 動作與寫入皆以該表 + bot token 即時驗證頻道/身分組歸屬,allowed_mentions 用最小白名單。Ops:Bot 須設 Public、後台註冊新 redirect URI(`DISCORD_BOT_INVITE_REDIRECT_URI`)。

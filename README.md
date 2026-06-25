# SteamSaleChecker

自建的 Steam 特價追蹤站。後端定時抓 Steam 官方端點與 GamerPower、**自建價格歷史**(計算「本站追蹤以來最低」),烤成靜態 JSON;前端 Astro 以深色電競風呈現,支援繁中/英切換。掛在個人網站子站、同時作為作品集。

> 目前進度見 [`PROGRESS.md`](PROGRESS.md)。本 README 涵蓋已完成的「公開站」子系統。

## 功能(MVP 公開站)
- **熱門特價榜(SteamDB 風)**:緊湊**可排序列表**(折扣/特價/原價欄位點擊排序)與**卡片檢視**可切換;每款顯示折扣、現價/原價、「本站最低」狀態、**史低日期**、**特價即時倒數**、**列內價格走勢 sparkline**(降綠/升紅)與 **Steam 評價**(正評%)。內建**單款搜尋**與**篩選**(最低折扣/最高價/只看 ≤ 史低/**類型**)。
- **即將結束**:48 小時內結束的特價另成一區。
- **免費領取(Steam)**:「領了就永久擁有」的 **Steam** 免費遊戲/DLC(GamerPower,僅收平台含 Steam 者),附領取期限與 giveaway 價值。
- **商品詳細頁**(`/game?appid=`):點任一遊戲開專屬頁面,看價格走勢圖(本站自建歷史)、本站最低、Steam 評價、介紹、類型、上市日與截圖,一鍵前往 Steam。
- **願望清單 + Discord 登入 + 降價/目標價通知**:用 Discord 登入收藏遊戲、跨裝置同步(未登入用 localStorage、登入後合併);收藏的遊戲創本站新低時,bot 在你的 Discord 專區頻道 @你提醒。可在 `/game` 或 `/favorites` 為每款收藏設**目標價**,跌破才通知(設了目標就只看目標)。
- **免費領取通知 + 特價摘要**:新永久入庫免費遊戲出現時自動發 Discord 公告;另可開啟每日/每週特價精選摘要(`SSC_DIGEST_HOURS`)。
- **個人化通知偏好**(登入後於 `/settings`):每位使用者可自訂降價通知開關、個人免費遊戲通知、每日/每週摘要訂閱、**只接收特定類型**、以及通知**送到共用頻道 @你或私訊 DM**(存於 DB,worker 依偏好決定對誰、用什麼方式發);摘要訂閱讓你不必改 `SSC_DIGEST_HOURS` env 即可自選頻率。
- **收藏頁**(`/favorites`):集中顯示你收藏的所有遊戲(含目前沒特價的),帶現價/史低、可快速移除、連到商品詳細頁。
- **設定頁**(`/settings`):集中主題(跟隨系統/深/淺)、語言、預設檢視,以及登入後的**通知偏好**(降價/免費/摘要/類型/通知方式)。
- 繁中/英 i18n、**深/淺色主題切換**(跟隨系統偏好、可手動切、持久)、PWA(favicon/manifest/OG 分享預覽)、資料新鮮度標示、About 技術說明段、來源歸屬。

## 架構
```
worker (Node+TS, cron)  ──抓 Steam/GamerPower──▶  SQLite(價格歷史 + observed_low)
                                                       │ 烤
                                                       ▼
                              web/public/data/{deals,free,meta}.json
                                                       ▲ client fetch(免重 build)
web (Astro 靜態站, nginx)  ──────────────────────────┘
```
- monorepo(npm workspaces):`shared`(純函式 + 型別)、`worker`(抓取/SQLite/烤 JSON)、`web`(Astro)。
- 所有第三方呼叫都在 server-side;公開瀏覽永遠是靜態 JSON。

## 開發 / 執行
需求:Node 20+。

```bash
npm install                      # 安裝所有 workspace 相依

# 後端:抓資料 + 產出 web/public/data/*.json(可用 SSC_DEAL_LIMIT 控制榜長度)
SSC_DEAL_LIMIT=40 npm -w @ssc/worker run run

# 前端
npm -w @ssc/web run dev          # 本機開發
npm -w @ssc/web run build        # 產出 web/dist(靜態,交給 nginx)

# 帳號 / 願望清單 API(需先建 api/.env,見下)
npm -w @ssc/api run dev          # http://localhost:8787

# 測試
npm test                         # vitest(shared / worker / api)
```

### 環境變數(worker)
| 變數 | 預設 | 說明 |
|---|---|---|
| `SSC_DATA_DIR` | `web/public/data` | 烤出的 JSON 目錄 |
| `SSC_DB` | `data/steam.db` | SQLite 檔路徑 |
| `SSC_DEAL_LIMIT` | `120` | 特價榜抓取上限(熱銷排序) |
| `ITAD_API_KEY` | —— | ITAD 史低刷新金鑰(API Key,非 OAuth secret);設了才啟用自動/手動 seed,未設則略過 |
| `SSC_ITAD_REFRESH_HOURS` | `24` | worker 自動 ITAD 刷新間隔(小時);需有 `ITAD_API_KEY` |
| `SSC_DIGEST_HOURS` | `0` | 每日/每週特價摘要發 Discord 間隔(小時):0=停用、24=每日、168=每週 |
| `SSC_HISTORY_KEEP_DAYS` | `365` | `price_history` 保留天數(每輪修剪過舊點;0=不修剪)。史低存於 `game_stats`,不受影響 |

### Discord 帳號(api)
複製 `api/.env.example` 為 `api/.env` 並填:`DISCORD_CLIENT_ID`、`DISCORD_CLIENT_SECRET`(Discord Developer Portal 取得)、`SESSION_SECRET`(≥32 字隨機字串)。Discord 應用的 OAuth2 → Redirects 需加 `http://localhost:8787/auth/callback`(上線再加正式網域)。`api/.env` 已被 gitignore,**切勿提交**。

**降價通知(Plan 3)**:`api/.env` 另填 `DISCORD_BOT_TOKEN`(Bot 分頁)、`DISCORD_GUILD_ID`、`DISCORD_NOTIFY_CHANNEL_ID`。Bot 以 `bot` scope + 權限 **View Channels / Send Messages / Create Instant Invite**(整數 3073)邀進你的伺服器,無需 privileged intents。worker 會載入 `api/.env`,抓取後對「收藏且創本站新低」的遊戲在頻道 @ 提醒(未設定則略過);登入時以 `guilds.join` 自動把使用者加進伺服器。

### ITAD 史低刷新(選用:自動 + 手動)
冷啟動時「史低」只是第一次觀測值。設定 [IsThereAnyDeal](https://isthereanydeal.com/apps/) 的 **API Key**(`ITAD_API_KEY`,**不是** OAuth Client Secret)即可用真實 Steam 史低(台灣區、台幣)校正。只更新 `game_stats` 的 `seeded_low_cents` / `observed_low_cents` / `observed_low_at`,**不會**往 `price_history` 補歷史價格點(走勢曲線仍隨時間累積)。

- **自動(常駐)**:worker 每輪結束檢查,距上次刷新達 `SSC_ITAD_REFRESH_HOURS`(預設 24h)就重抓一次史低寫回;失敗不影響主流程,效果於下一輪重烤反映。
- **手動(CLI,首次驗證或一次性補):**

```bash
# 0) 先確保 game_stats 已有資料(跑過一次 worker)
npm -w @ssc/worker run run

# 1) 只查不寫,驗證 country=TW 回 TWD、解析正確(建議先跑)
npm -w @ssc/worker run seed -- --check

# 2) 實際寫入(idempotent,可重跑)
npm -w @ssc/worker run seed

# 3) 重烤 JSON,讓 deals.json 反映新史低與 isAtObservedLow
npm -w @ssc/worker run run
```

腳本對 lookup/storelow 有重試退避,並印出幣別分布;非 TWD 會警示。**正式站**:`ITAD_API_KEY` 與其他祕密一樣放在主機的 `api/.env`(gitignore,`git reset` 不覆蓋),worker 經 `env_file` 取得;有 key 後 worker 即每日自動刷新史低,無需每次手動。

## 資料來源與歸屬
- **Steam 商店端點**(`featuredcategories` / `appdetails` / 特價搜尋,免金鑰,台灣區 `cc=tw`):特價清單、台幣價、封面圖、熱銷排序。
- **GamerPower API**(免金鑰):永久入庫免費遊戲/DLC。**站內保留可點擊連結回 GamerPower.com**。
- 「歷史最低」為**本站自建追蹤**(非 SteamDB/ITAD runtime),誠實標示「追蹤以來最低」。
- 本站與 Valve 無任何關係。

## 後續(尚未實作,見 PROGRESS)
Discord 帳號 + 願望清單、Discord 專區降價通知、價格走勢圖、部署設定。

# SteamSaleChecker

自建的 Steam 特價追蹤站。後端定時抓 Steam 官方端點與 GamerPower、**自建價格歷史**(計算「本站追蹤以來最低」),烤成靜態 JSON;前端 Astro 以深色電競風呈現,支援繁中/英切換。掛在個人網站子站、同時作為作品集。

> 目前進度見 [`PROGRESS.md`](PROGRESS.md)。本 README 涵蓋已完成的「公開站」子系統。

## 功能(MVP 公開站)
- **熱門特價榜**:目前在 Steam 特價、以熱銷排序、儘量完整;每款顯示折扣、現價/原價,以及「本站最低 / 離最低差多少」。
- **即將結束**:48 小時內結束的特價另成一區。
- **免費領取**:跨平台「領了就永久擁有」的免費遊戲/DLC(GamerPower),附領取期限與 giveaway 價值。
- **價格走勢圖**:點任一特價卡,看該遊戲「本站追蹤以來」的價格歷史(uPlot;資料隨時間累積)。
- **願望清單 + Discord 登入**:用 Discord 登入收藏遊戲、跨裝置同步;未登入用 localStorage、登入後合併(降價通知為 Plan 3)。
- 繁中/英 i18n、深色主題、資料新鮮度標示、About 技術說明段、來源歸屬。

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
| `ITAD_API_KEY` | —— | 僅供一次性史低 seed 腳本(`npm -w @ssc/worker run seed`),production 不需要 |

### Discord 帳號(api)
複製 `api/.env.example` 為 `api/.env` 並填:`DISCORD_CLIENT_ID`、`DISCORD_CLIENT_SECRET`(Discord Developer Portal 取得)、`SESSION_SECRET`(≥32 字隨機字串)。Discord 應用的 OAuth2 → Redirects 需加 `http://localhost:8787/auth/callback`(上線再加正式網域)。`api/.env` 已被 gitignore,**切勿提交**。

## 資料來源與歸屬
- **Steam 商店端點**(`featuredcategories` / `appdetails` / 特價搜尋,免金鑰,台灣區 `cc=tw`):特價清單、台幣價、封面圖、熱銷排序。
- **GamerPower API**(免金鑰):永久入庫免費遊戲/DLC。**站內保留可點擊連結回 GamerPower.com**。
- 「歷史最低」為**本站自建追蹤**(非 SteamDB/ITAD runtime),誠實標示「追蹤以來最低」。
- 本站與 Valve 無任何關係。

## 後續(尚未實作,見 PROGRESS)
Discord 帳號 + 願望清單、Discord 專區降價通知、價格走勢圖、部署設定。

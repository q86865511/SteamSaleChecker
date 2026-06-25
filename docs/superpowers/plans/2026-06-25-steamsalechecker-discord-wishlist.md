# SteamSaleChecker Discord 帳號 + 願望清單 Implementation Plan(Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 讓使用者用 Discord 登入、收藏遊戲(跨裝置同步);未登入用 localStorage、登入後合併。新增一支常駐 `api` 服務(Fastify),共用既有 SQLite。

**Architecture:** 新 `api/` workspace(Fastify + 加密 cookie session + CORS),開同一個 `data/steam.db`(WAL)新增 `users`/`wishlist` 表。公開瀏覽仍是靜態 JSON;只有登入/收藏走 API。Discord OAuth2 authorization-code(scope `identify`)。前端加登入鈕 + 卡片收藏星號 + localStorage→登入合併。**Discord 降價通知屬 Plan 3,不在此。**

**Tech Stack:** Node 20 + TS、Fastify、@fastify/secure-session、@fastify/cors、better-sqlite3、vitest。前端沿用 Astro client island。

**需使用者提供(可並行):** Discord application 的 **Client ID / Client Secret**(放 `api/.env`,勿入 git)、OAuth2 Redirect 加 `http://localhost:8787/auth/callback`。

---

## File Structure
```
api/
  package.json            # fastify, @fastify/secure-session, @fastify/cors, better-sqlite3
  tsconfig.json
  .env.example            # 範本(實際 .env 由使用者填、gitignore)
  src/
    db.ts                 # 開共用 DB + 確保 users/wishlist 表 + wishlist 資料層(TDD)
    discord.ts            # OAuth URL 組裝、token 交換、抓 @me(純函式部分可測)
    auth.ts               # /auth/discord, /auth/callback, /auth/logout, /api/me 路由
    wishlist.ts           # /api/wishlist GET/POST/DELETE/merge 路由(需登入)
    server.ts             # 組裝 Fastify、session、cors、註冊路由、啟動
web/ (既有)
  src/scripts/wishlist.ts # 前端收藏狀態(localStorage / API)、登入狀態、合併
  src/scripts/app.ts      # 加登入鈕、卡片星號、整合 wishlist.ts
```
`.gitignore` 追加 `.env`(已含)與 `api/.env`。

---

## 資料模型(追加到既有 SQLite)
- `users(id INTEGER PK AUTOINCREMENT, discord_id TEXT UNIQUE, username TEXT, avatar TEXT, created_at INTEGER, last_login INTEGER)`
- `wishlist(user_id INTEGER, appid INTEGER, added_at INTEGER, PRIMARY KEY(user_id, appid))`

(api 啟動時 `CREATE TABLE IF NOT EXISTS`;`games` 表由 worker 維護,wishlist.appid 不強制 FK。)

---

## API 設計
- `GET /health` → `{ok:true}`(冒煙用)。
- `GET /auth/discord` → 產生 `state` 存 session,302 到
  `https://discord.com/api/oauth2/authorize?response_type=code&client_id=…&redirect_uri=…&scope=identify&state=…`。
- `GET /auth/callback?code&state` → 驗 `state`;POST `https://discord.com/api/oauth2/token`(grant_type=authorization_code)換 token;GET `https://discord.com/api/users/@me`(Bearer);upsert user;`session.set('userId', id)`;302 回 `WEB_ORIGIN`。
- `POST /auth/logout` → `session.delete()`。
- `GET /api/me` → 登入回 `{id,username,avatar}`,否則 401。
- `GET /api/wishlist` → `number[]`(appid),未登入 401。
- `POST /api/wishlist {appid}` → 加入。
- `DELETE /api/wishlist/:appid` → 移除。
- `POST /api/wishlist/merge {appids:number[]}` → 批次加入(登入時合併 localStorage)。

Session:`@fastify/secure-session`(加密 cookie,免 server store),`SESSION_KEY` 為 32-byte 金鑰。CORS:`@fastify/cors` 允許 `WEB_ORIGIN`、`credentials:true`(僅 dev;prod 由 nginx 同源代理 `/api`、`/auth`)。

---

## 環境變數(`api/.env`,gitignored;附 `.env.example`)
| 變數 | 範例 | 說明 |
|---|---|---|
| `DISCORD_CLIENT_ID` | …… | 使用者填 |
| `DISCORD_CLIENT_SECRET` | …… | 使用者填(機密,勿入 git/聊天) |
| `DISCORD_REDIRECT_URI` | `http://localhost:8787/auth/callback` | 與 Discord 後台一致 |
| `SESSION_KEY` | (32-byte hex) | 由建置時產生 |
| `WEB_ORIGIN` | `http://localhost:4321` | CORS 與登入後導回 |
| `API_PORT` | `8787` | API 埠 |
| `SSC_DB` | `../data/steam.db` | 預設指向 repo 根 data/steam.db |

---

## Tasks

### Task B0:api 骨架 + DB 表 + /health + /api/me
**Files:** `api/package.json`, `api/tsconfig.json`, `api/.env.example`, `api/src/{db.ts,server.ts,auth.ts}`(auth 先放 /api/me)
- [ ] 建 workspace(root package.json workspaces 已含 glob?否則加 `api`)、安裝 fastify + plugins + better-sqlite3。
- [ ] `db.ts`:`openDb(path)` 開共用 DB(WAL)、`ensureAuthTables(db)` 建 users/wishlist。
- [ ] `server.ts`:註冊 secure-session(SESSION_KEY)、cors(WEB_ORIGIN, credentials)、`/health`、掛 auth 路由、listen API_PORT。
- [ ] `auth.ts`:先做 `GET /api/me`(讀 session.userId → 查 users → 回 {id,username,avatar} 或 401)。
- [ ] `.env.example` 列出上表變數;產生一把 `SESSION_KEY` 寫進(範本可放假值,真值在 .env)。
- [ ] 冒煙:啟動 + `curl /health` 回 `{ok:true}`;`/api/me` 未登入回 401。
- [ ] commit。

### Task B1:wishlist 資料層(TDD)+ 路由
**Files:** `api/src/db.ts`(+ 函式 + 測試 `api/src/db.test.ts`)、`api/src/wishlist.ts`
- [ ] TDD `db.ts`:`addWish(db,userId,appid)`、`removeWish`、`listWish(db,userId):number[]`、`mergeWish(db,userId,appids[])`;以記憶體 DB 測新增/去重/移除/合併。
- [ ] `wishlist.ts`:四個路由,前置檢查 `session.userId`,無則 401;呼叫資料層。
- [ ] commit。

### Task B2:Discord OAuth 路由
**Files:** `api/src/discord.ts`(純函式 + token/me 抓取)、`api/src/auth.ts`(+ /auth/* 路由)、測試 `api/src/discord.test.ts`
- [ ] `discord.ts`:`buildAuthorizeUrl({clientId,redirectUri,state})`(TDD,純字串)、`exchangeCode(code)`→token、`fetchMe(token)`→{id,username,avatar}。
- [ ] `auth.ts`:`/auth/discord`(存 state、302)、`/auth/callback`(驗 state、換 token、upsert user、設 session、302 回 WEB_ORIGIN)、`/auth/logout`。
- [ ] `upsertUser(db, me)`:依 discord_id upsert,更新 last_login。
- [ ] 可測部分(buildAuthorizeUrl、state 驗證)寫測試;**live 登入待使用者憑證**(於 B4 驗)。
- [ ] commit。

### Task B3:前端收藏 UI + 登入
**Files:** `web/src/scripts/wishlist.ts`(新)、`web/src/scripts/app.ts`、`web/src/layouts/Base.astro`(登入鈕/星號樣式)、i18n
- [ ] `wishlist.ts`:`apiBase()`(dev→`http://localhost:8787`,prod→同源 '')、`getMe()`、`loadWishlist()`(登入打 API,未登入讀 localStorage)、`toggle(appid)`、`mergeLocalOnLogin()`。
- [ ] `app.ts`:渲染卡片時加★鈕(已收藏實心);點★ toggle;頂部加「Discord 登入 / 登出」鈕(連 `/auth/discord`、`/auth/logout`);載入時 `getMe()`→若登入且 localStorage 有項目→`merge`→清空 localStorage。
- [ ] i18n 加 `login`/`logout`/`wishlist` 等鍵(兩語系)。
- [ ] commit。

### Task B4:整合驗證 + PR
- [ ] 用**假/本機**設定啟動 api + web:驗 `/health`、`/api/me` 401、未登入收藏存 localStorage、星號 toggle、CORS 不報錯。
- [ ] 文件:`PROGRESS.md`/`README.md`(新增帳號/收藏、api 執行方式、env)。
- [ ] **live 登入測試**:待使用者把 Client ID/Secret 放 `api/.env`、Discord 後台加 redirect 後,走完一次真實 Discord 登入 → 收藏同步。
- [ ] push + 開 PR(merge 待使用者確認)。

---

## 驗證
- `npx vitest run`(新增 db/discord 純函式測試)。
- `npm -w @ssc/api run dev` 啟動;`curl localhost:8787/health`。
- 前端 dev 啟動,未登入收藏→localStorage;（接上憑證後）Discord 登入→`/api/me` 有人、收藏入 DB、跨裝置同步。

## 風險
- **CORS + cookie**:跨埠需 `credentials:true` + 前端 `fetch(...,{credentials:'include'})` + cookie `SameSite=Lax`/`Secure`(dev http 下 Secure 要關)。prod 同源可免。
- **secret 安全**:Secret 僅在 `api/.env`(gitignored),絕不入 git/聊天。
- **並行 SQLite**:WAL;worker 與 api 各短交易。
- **state CSRF**:OAuth `state` 存 session 並於 callback 比對。

## 後續
Plan 3(Discord 專區降價通知)、Plan 4(部署:systemd api + nginx 反代 /api、/auth + 子站路徑)。

# SteamSaleChecker Discord 降價通知 Implementation Plan(Plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。Steps use checkbox (`- [ ]`)。

**Goal:** 當使用者「收藏的遊戲創本站新低」時,worker 在指定的 Discord 專區頻道 **@該使用者** 提醒;用 `notifications` 表防止同一低點重複通知。登入時自動把使用者加進伺服器(`guilds.join`),這樣 @ 才 ping 得到。

**Architecture:** 偵測與發送在 **worker**(它本來就算價格與新低);共用同一 SQLite 讀 `wishlist`/`users`、寫 `notifications`。Discord 透過 REST(bot token)發訊息。`api` 在 OAuth callback 多做 `guilds.join`。皆 server-side。

**Tech Stack:** 沿用 Node+TS、better-sqlite3、Discord REST、vitest。

**需使用者提供:** `api/.env` 加 `DISCORD_BOT_TOKEN`(機密)、`DISCORD_GUILD_ID`、`DISCORD_NOTIFY_CHANNEL_ID`;bot 以 `bot` scope + View Channels/Send Messages/Create Instant Invite(=3073)邀進伺服器;無需 privileged intents。

---

## 設定來源(env)
所有 Discord 機密集中在 **`api/.env`**(已 gitignore)。**worker 也載入 `api/.env`**(`dotenv` 指定路徑到 repo 根的 `api/.env`),取得 `DISCORD_BOT_TOKEN` / `DISCORD_NOTIFY_CHANNEL_ID`。`api` 取 `DISCORD_BOT_TOKEN` / `DISCORD_GUILD_ID` 做 `guilds.join`。若這些未設定 → 通知與自動入伺服器**靜默略過**(不影響其它流程)。

## 資料模型(追加)
- `notifications(user_id INTEGER, appid INTEGER, notified_low_cents INTEGER, notified_at INTEGER, PRIMARY KEY(user_id, appid))`
worker 的 `openDb` migration 追加 `notifications`,並以 `IF NOT EXISTS` 確保 `users`/`wishlist` 存在(與 api 同 schema),使 worker 可獨立查詢。

## 「值得通知的新低」定義
只有「**價格跌破先前已記錄的最低**」才通知(`prevLow != null && current < prevLow`)。首次觀測(prevLow=null)不算、不通知。pipeline 蒐集本次 meaningful new low 的 `{appid, lowCents}`。

---

## Tasks

### Task C0:notifications 表 + Discord bot 發訊(TDD 訊息格式)
**Files:** `worker/src/db.ts`(+notifications/users/wishlist 表 + 查詢/記錄函式)、`worker/src/discord-bot.ts`(新)、`worker/src/discord-bot.test.ts`
- [ ] `worker/src/db.ts`:openDb migration 追加 `notifications` + `users`/`wishlist`(IF NOT EXISTS)。新增:
  - `getWishersForApp(db, appid): {userId, discordId}[]`(JOIN users)。
  - `alreadyNotified(db, userId, appid, lowCents): boolean`(notifications.notified_low_cents <= lowCents 視為已通知)。
  - `markNotified(db, userId, appid, lowCents, at)`(upsert)。
- [ ] `discord-bot.ts`:
  - `formatNotifyMessage({discordId,name,lowCents,appid})`(純,TDD):`<@id> 🎮 你收藏的《name》創新低 NT$x!\n<store url>`。
  - `postChannelMessage(botToken, channelId, content)`:`POST https://discord.com/api/v10/channels/{channelId}/messages`,header `Authorization: Bot <token>`,body `{content, allowed_mentions:{parse:['users']}}`。
- [ ] TDD `formatNotifyMessage`。commit。

### Task C1:worker 通知 pipeline
**Files:** `worker/src/pipeline.ts`(蒐集 meaningful new lows)、`worker/src/notify.ts`(新,TDD 偵測/去重)、`worker/src/index.ts`(載入 api/.env、跑通知)
- [ ] `pipeline.ts`:`recordPriceAndLow` 前先取 prevLow;若 `prevLow != null && price < prevLow` 收集 `{appid, name, lowCents}`;`RunResult` 回 `newLows`。
- [ ] `notify.ts`:`collectPending(db, newLows): {userId,discordId,appid,name,lowCents}[]`(對每個 newLow 找 wishers,排除 alreadyNotified)。TDD:以暫存 DB 放 user/wishlist/notifications,驗證命中與去重。`dispatchNotifications(db, pending, botToken, channelId)`:逐筆 `postChannelMessage` 成功後 `markNotified`(失敗則不標記、下次重試)。
- [ ] `index.ts`:`dotenv` 載入 `api/.env`(路徑 = REPO_ROOT/api/.env);跑完 pipeline 後,若 `DISCORD_BOT_TOKEN` & `DISCORD_NOTIFY_CHANNEL_ID` 都有 → `collectPending` + `dispatchNotifications`;否則 log「未設定,略過通知」。
- [ ] commit。

### Task C2:api 登入時 guilds.join
**Files:** `api/src/discord.ts`(+addGuildMember)、`api/src/auth.ts`(callback 呼叫 + scope 加 guilds.join)、`api/src/discord.test.ts`(buildAuthorizeUrl scope 測試更新)
- [ ] `discord.ts`:`buildAuthorizeUrl` 的 scope 改 `identify guilds.join`(更新測試斷言);`exchangeCode` 維持(已回 access_token);`addGuildMember(botToken, guildId, discordId, accessToken)`:`PUT https://discord.com/api/v10/guilds/{guildId}/members/{discordId}`,header `Authorization: Bot <token>`,body `{access_token}`;204(已在)或 201(新加)皆視為成功,其它吞錯不影響登入。
- [ ] `auth.ts` callback:換 token 後若 `DISCORD_BOT_TOKEN` & `DISCORD_GUILD_ID` 有 → `addGuildMember(...)`(try/catch,失敗只 log)。`exchangeCode` 需回傳 access_token(目前回 string token,沿用)。
- [ ] commit。

### Task C3:整合 + 文件 + PR
- [ ] 不需憑證的驗證:`npx vitest run` 全綠;tsc(worker/api)0;worker 在無 Discord env 時略過通知不報錯。
- [ ] 文件:`PROGRESS.md` / `README.md`(通知功能、env 三個值、bot 權限 3073、worker 載 api/.env)。
- [ ] **待憑證**:使用者填 token/id 後,手動製造一次新低(把某收藏遊戲的 `game_stats.observed_low_cents` 改高再跑 worker)→ 確認頻道收到 @ 提醒、且不重複。
- [ ] push + 開 PR(merge 待確認)。

---

## 驗證
- 純函式/去重:vitest(formatNotifyMessage、collectPending 去重)。
- 無 env:worker 跑完正常產出 JSON、log 略過通知。
- 有 env(使用者端):新低 → 頻道 @ 提醒一次,重跑不重複。

## 風險
- **@ 要 ping 到** → 使用者須在伺服器內(靠 `guilds.join` 自動加;或手動邀請連結 fallback)。
- **bot 權限/頻道可見** → bot 需 View Channels + Send Messages 於該頻道。
- **去重** → `notifications(user,appid)` 記已通知低點;同一低點只發一次。
- **secret** → 只在 `api/.env`;worker 以路徑載入,勿入 git。
- **首跑全是新低** → 已用「prevLow != null」排除首次觀測,避免上線首日洗頻。

## 後續
Plan 4 部署(systemd worker timer + api service + nginx);通知頻率上限、Email 備援(選配)。

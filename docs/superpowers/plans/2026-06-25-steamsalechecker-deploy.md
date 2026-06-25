# SteamSaleChecker 部署 + CI/CD Implementation Plan(Plan 4)

> **For agentic workers:** 部署觸及 production(terrychou.com 的 Caddy / cloudflared / Docker)。每一步先看指令、驗證、不弄壞現有站(terrychou.com、soulshard.terrychou.com)。

**Goal:** 把 SteamSaleChecker 上線到 `steam.terrychou.com`,完全貼合使用者既有架構(Cloudflare Tunnel → Caddy → Docker 後端 + Caddy 靜態前端),並用 GitHub Actions(`appleboy/ssh-action`)做 push-to-main 自動部署 —— 跟 soulshard 同一套。

**既有架構(已勘查):**
- Cloudflare Tunnel(`cloudflared`,systemd,`/etc/cloudflared/config.yml`)ingress → Caddy `127.0.0.1:8080`。
- Caddy(`/etc/caddy/Caddyfile`,`auto_https off`,`http_port 8080`):主站 `/srv/main`;`soulshard.terrychou.com` 的 `/api/*`、`/rt` → `127.0.0.1:8787`,其餘靜態 `/srv/soulshard`。
- Docker:soulshard `server-api-1`(8787)+ `server-db-1`(postgres)。**8787 已佔用。**
- CICD:soulshard 用 GitHub-hosted runner + `appleboy/ssh-action`(secrets `OCI_HOST`/`OCI_USER`/`OCI_SSH_KEY`)→ SSH `git reset --hard` + `docker compose up -d --build` + health check。
- Ubuntu 24.04 ARM、Node v22、passwordless sudo 可用。主機 repo 慣例:`~/<repo>`;靜態 `/srv/<name>`。

---

## 目標拓撲(steam.terrychou.com)
```
Cloudflare ─ tunnel ─ Caddy(127.0.0.1:8080)
  steam.terrychou.com:
     handle /api/*, /auth/*  → reverse_proxy 127.0.0.1:8788   (ssc-api 容器)
     handle (其餘)           → file_server  /srv/steam         (Astro dist)
     /data/*                 → /srv/steam/data                 (worker 烤的 JSON)
ssc-api 容器   : Fastify :8788(綁 127.0.0.1)、presence(bot 上線)、SQLite volume、讀 .env
ssc-worker 容器: 每 ~30 分跑 pipeline → 寫 /srv/steam/data/*.json + 共用 SQLite volume
主機 repo: ~/SteamSaleChecker(git reset 部署);web 在主機 build → /srv/steam
SQLite: 具名 volume(跨部署保留);祕密: ~/SteamSaleChecker/api/.env(gitignore,不進 CI)
```

---

## 需要的 production 設定差異(本機 → 線上)
1. **同源**:線上 web 與 api 同網域(Caddy 同站代理 `/api`、`/auth`)→ **不需 CORS**。前端 `apiBase()` 在非 `:4321` 時回 `''`(同源),已符合。
2. **Cookie secure**:`secure-session` 目前 `cookie.secure:false`(本機 http)。線上走 https(Cloudflare)→ 需 `secure:true`。改成讀環境變數 `COOKIE_SECURE`(prod=true)。
3. **OAuth**:`api/.env`(prod)`DISCORD_REDIRECT_URI=https://steam.terrychou.com/auth/callback`、`WEB_ORIGIN=https://steam.terrychou.com`、`API_PORT=8788`。**Discord 後台 OAuth2 → Redirects 需加上線網址。**
4. **api 埠**:8788(避開 8787)。
5. **路徑**:`SSC_DB=/data/steam.db`(容器 volume)、`SSC_DATA_DIR=/site-data`(bind mount → `/srv/steam/data`)。

---

## 檔案(repo 內,本 plan 新增/改)
```
Dockerfile                      # 多階段:build web + 安裝 server 相依;run api 或 worker
docker-compose.yml              # services: api(8788) + worker(loop);共用 sqlite volume;bind /srv/steam/data
.dockerignore
.github/workflows/deploy.yml    # push→main:ssh-action → git reset + build web + compose up --build + health
api/src/server.ts               # cookie.secure 改讀 COOKIE_SECURE
api/.env.example                # 加 COOKIE_SECURE、註明 prod 值
docs/DEPLOY.md                  # 主機端設定步驟(Caddy/cloudflared/.env/首次部署)
```

---

## Tasks

### Task D1:容器化(Dockerfile + compose)— repo 端,不碰 prod
- [ ] `Dockerfile`(node:22-slim,ARM 相容):安裝 workspace 相依;`npm ci`;預設 `CMD` 跑 api;worker 用 compose command 覆寫。better-sqlite3 在 node:22 + arm64 有 prebuilt(驗證 build 成功)。
- [ ] `docker-compose.yml`:
  - `api`:`build .`、`command` 跑 `@ssc/api start`、`ports: "127.0.0.1:8788:8788"`、`env_file: api/.env`、`environment: API_PORT=8788, SSC_DB=/data/steam.db`、`volumes: sscdata:/data`、`restart: unless-stopped`。
  - `worker`:同 image、`command: sh -c "while true; do node ... ; sleep ${SSC_INTERVAL:-1800}; done"`(用 tsx 跑 `worker/src/index.ts`)、`env_file: api/.env`、`environment: SSC_DB=/data/steam.db, SSC_DATA_DIR=/site-data, SSC_DEAL_LIMIT=120`、`volumes: sscdata:/data, /srv/steam/data:/site-data`、`restart: unless-stopped`。
  - `volumes: sscdata:`。
- [ ] `.dockerignore`(node_modules、web/dist、data、.git…)。
- [ ] 本機 `docker build` 驗證(若本機無 docker,延到主機驗)。commit。

### Task D2:prod 設定(cookie secure)— repo 端
- [ ] `api/src/server.ts`:`cookie.secure` 改 `process.env.COOKIE_SECURE === 'true'`(預設 false 給本機)。`sameSite:'lax'` 不變(同源)。
- [ ] `api/.env.example`:加 `COOKIE_SECURE=false`(註:prod=true);註明 prod 的 `DISCORD_REDIRECT_URI`/`WEB_ORIGIN`/`API_PORT=8788`。
- [ ] tsc + vitest 綠。commit。

### Task D3:CI/CD workflow — repo 端
- [ ] `.github/workflows/deploy.yml`(仿 soulshard):`on push main` + `workflow_dispatch`;`concurrency: deploy-steam`;`appleboy/ssh-action`:
  ```
  set -e
  cd ~/SteamSaleChecker
  git fetch --all --prune
  git reset --hard origin/main        # 保留 gitignore 的 api/.env、node_modules
  npm ci
  npm -w @ssc/web run build           # 產 web/dist
  rsync -a --delete --exclude data ./web/dist/ /srv/steam/   # 靜態 → Caddy(不刪 data)
  docker compose up -d --build        # api + worker
  # health(主機直打 api 埠)
  for i in $(seq 1 15); do sleep 2; curl -fsS http://127.0.0.1:8788/health && break; done
  ```
- [ ] commit。

### Task D4(host,SSH 執行,逐步驗證):首次部署與接線
> 每步先給使用者看指令。**先不要動 cloudflared/Caddy 既有區塊**,只「新增」。
- [ ] **clone repo 到主機**:`git clone https://github.com/q86865511/SteamSaleChecker ~/SteamSaleChecker`;放 `api/.env`(prod 值,含 Discord 憑證 + `COOKIE_SECURE=true`)。
- [ ] **建立靜態目錄**:`sudo mkdir -p /srv/steam/data && sudo chown -R ubuntu:ubuntu /srv/steam`。
- [ ] **首次 build + up**:`cd ~/SteamSaleChecker && npm ci && npm -w @ssc/web run build && rsync ... /srv/steam/ && docker compose up -d --build`;確認 `curl 127.0.0.1:8788/health` OK、worker 寫出 `/srv/steam/data/*.json`。
- [ ] **Caddy**:在 `/etc/caddy/Caddyfile` **新增**一個 `http://steam.terrychou.com` 區塊(同 soulshard 模式:`/api/* /auth/*` → `127.0.0.1:8788`,其餘 `file_server /srv/steam`);`sudo caddy validate --config /etc/caddy/Caddyfile` 再 `sudo systemctl reload caddy`。**先驗證 terrychou.com/soulshard 仍正常。**
- [ ] **cloudflared**:在 `/etc/cloudflared/config.yml` ingress **新增** `- hostname: steam.terrychou.com / service: http://127.0.0.1:8080`(放在 404 fallback 之前);`cloudflared tunnel route dns <tunnel> steam.terrychou.com`(建 DNS);`sudo systemctl restart cloudflared`。**先確認既有 ingress 沒動到。**
- [ ] **驗證**:外網開 `https://steam.terrychou.com` → 特價榜出現;Discord 登入(prod redirect)→ 收藏 → 通知。

### Task D5:CI 金鑰與密鑰(使用者 + 我協作)
- [ ] 產**專用部署金鑰**(`ssh-keygen -t ed25519 -f deploy_key -N ""`);公鑰 append 到主機 `~/.ssh/authorized_keys`(我可用現有 SSH 做);私鑰 → GitHub repo Secret `OCI_SSH_KEY`(**使用者自己 `gh secret set` 或用 UI**,私鑰是機密)。`OCI_HOST=150.230.195.127`、`OCI_USER=ubuntu` 兩個非機密 secret。
- [ ] push 一個小改動驗證 Actions 自動部署成功。

---

## 使用者需親自做(我無法代替)
1. **Discord 後台**:OAuth2 → Redirects 加 `https://steam.terrychou.com/auth/callback`。
2. **GitHub Secrets**:`OCI_SSH_KEY`(私鑰,機密)、`OCI_HOST`、`OCI_USER`(我可給指令,但設 secret 由你按)。
3. (DNS 我可用 `cloudflared tunnel route dns` 建;若你偏好 Cloudflare 後台手動也行。)

---

## 驗證(端到端)
- `https://steam.terrychou.com` 外網可開、特價榜/免費/價格圖正常。
- Discord 登入(prod)→ 收藏跨裝置 → 創新低時頻道 @你。
- bot 顯示上線(api 容器常駐 presence)。
- push 一個 commit 到 main → GitHub Actions 自動部署 → 站上更新。
- **terrychou.com、soulshard.terrychou.com 全程不受影響。**

## 風險與緩解
- **碰 prod 共用設定(Caddy/cloudflared)**:只「新增」區塊、改前備份、`validate` 後再 reload、立即回測既有站;出錯可秒回滾。
- **8787 衝突**:用 8788。
- **SQLite 跨部署**:具名 volume,不在 build 目錄。
- **better-sqlite3 ARM build**:node:22 有 prebuilt;失敗則 image 內裝 build-essential 編譯。
- **祕密**:`api/.env` 只在主機、gitignore;部署私鑰用專用 deploy key 放 GitHub Secret。
- **cookie/OAuth**:prod 用 https→`COOKIE_SECURE=true`、redirect/origin 改線上網址。

## 後續
監控/log 輪替、worker 失敗告警、亮色主題等選配。

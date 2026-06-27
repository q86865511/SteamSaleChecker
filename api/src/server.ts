import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import secureSession from '@fastify/secure-session';
import type { DB } from './db';
import { registerAuth } from './auth';
import { registerWishlist } from './wishlist';
import { registerNotif } from './notif';
import { registerBotConnect } from './bot-connect';

const SESSION_SECRET = process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32
  ? process.env.SESSION_SECRET
  : 'ssc-dev-insecure-secret-please-change-0123456789';

export async function buildApp(db: DB): Promise<FastifyInstance> {
  // trustProxy:正式站在 Caddy + Cloudflare Tunnel 之後,需信任 X-Forwarded-For 才能取得真實
  // client IP;否則 rate-limit 會把全部流量算到反向代理的單一 IP 上,造成正常使用者被誤鎖。
  const app = Fastify({ logger: false, trustProxy: true });
  // 安全標頭:API 只回 JSON / 302,無 HTML 故關閉 CSP;CORP 設 cross-origin 讓開發環境
  // (web :4321 → api :8787,帶 cookie)能跨來源取用;其餘標頭(nosniff / frameguard / hsts…)用預設。
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  // 每 IP 速率限制(預設 100/分;SSC_RATE_LIMIT_MAX 可調)。超量回 429 + Retry-After。
  await app.register(rateLimit, {
    max: Number(process.env.SSC_RATE_LIMIT_MAX) || 100,
    timeWindow: '1 minute',
  });
  await app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:4321',
    credentials: true,
  });
  await app.register(secureSession, {
    secret: SESSION_SECRET,
    salt: 'ssc-fixed-salt16',
    cookieName: 'ssc_session',
    cookie: { path: '/', httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true' },
  });
  app.get('/health', async () => ({ ok: true }));
  registerAuth(app, db);
  registerWishlist(app, db);
  registerNotif(app, db);
  registerBotConnect(app, db);
  return app;
}

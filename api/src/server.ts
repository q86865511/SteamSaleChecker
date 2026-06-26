import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
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
  const app = Fastify({ logger: false });
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

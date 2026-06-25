import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { DB } from './db';
import { getUserById, upsertUser } from './db';
import { buildAuthorizeUrl, exchangeCode, fetchMe } from './discord';

declare module '@fastify/secure-session' {
  interface SessionData {
    userId: number;
    oauthState: string;
  }
}

export function registerAuth(app: FastifyInstance, db: DB): void {
  const cfg = () => ({
    clientId: process.env.DISCORD_CLIENT_ID ?? '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
    redirectUri: process.env.DISCORD_REDIRECT_URI ?? 'http://localhost:8787/auth/callback',
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:4321',
  });

  app.get('/api/me', async (req, reply) => {
    const userId = req.session.get('userId') as number | undefined;
    if (!userId) return reply.code(401).send({ error: 'not_logged_in' });
    const u = getUserById(db, userId);
    if (!u) return reply.code(401).send({ error: 'not_found' });
    return { id: u.id, username: u.username, avatar: u.avatar };
  });

  app.get('/auth/discord', async (req, reply) => {
    const c = cfg();
    if (!c.clientId) return reply.code(500).send({ error: 'discord_not_configured' });
    const state = randomBytes(16).toString('hex');
    req.session.set('oauthState', state);
    return reply.redirect(buildAuthorizeUrl({ clientId: c.clientId, redirectUri: c.redirectUri, state }));
  });

  app.get('/auth/callback', async (req, reply) => {
    const c = cfg();
    const { code, state } = req.query as { code?: string; state?: string };
    const saved = req.session.get('oauthState') as string | undefined;
    if (!code || !state || !saved || state !== saved) return reply.code(400).send({ error: 'bad_state' });
    req.session.set('oauthState', undefined);
    try {
      const token = await exchangeCode({ code, clientId: c.clientId, clientSecret: c.clientSecret, redirectUri: c.redirectUri });
      const me = await fetchMe(token);
      const userId = upsertUser(db, me);
      req.session.set('userId', userId);
      return reply.redirect(c.webOrigin);
    } catch {
      return reply.code(502).send({ error: 'oauth_failed' });
    }
  });

  app.post('/auth/logout', async (req, reply) => {
    req.session.delete();
    return { ok: true };
  });
}

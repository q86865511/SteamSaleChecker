import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DB } from './db';
import { getNotifPrefs, putNotifPrefs } from './db';
import type { NotifPrefs } from '@ssc/shared';

const nowSec = (): number => Math.floor(Date.now() / 1000);
function uid(req: FastifyRequest): number | undefined {
  return req.session.get('userId') as number | undefined;
}

export function registerNotif(app: FastifyInstance, db: DB): void {
  app.get('/api/notif/prefs', async (req, reply) => {
    const u = uid(req);
    if (!u) return reply.code(401).send({ error: 'not_logged_in' });
    return getNotifPrefs(db, u);
  });
  app.put('/api/notif/prefs', async (req, reply) => {
    const u = uid(req);
    if (!u) return reply.code(401).send({ error: 'not_logged_in' });
    const b = (req.body ?? {}) as Partial<NotifPrefs>;
    const p: Partial<NotifPrefs> = {};
    if (typeof b.dropEnabled === 'boolean') p.dropEnabled = b.dropEnabled;
    if (typeof b.freeEnabled === 'boolean') p.freeEnabled = b.freeEnabled;
    if (b.digestHours !== undefined) {
      if (![0, 24, 168].includes(b.digestHours)) return reply.code(400).send({ error: 'bad_digest' });
      p.digestHours = b.digestHours;
    }
    if (b.delivery !== undefined) {
      if (b.delivery !== 'channel' && b.delivery !== 'dm') return reply.code(400).send({ error: 'bad_delivery' });
      p.delivery = b.delivery;
    }
    if (b.genres !== undefined) {
      if (!Array.isArray(b.genres) || !b.genres.every(g => typeof g === 'string')) return reply.code(400).send({ error: 'bad_genres' });
      p.genres = b.genres;
    }
    putNotifPrefs(db, u, p, nowSec());
    return getNotifPrefs(db, u);
  });
}

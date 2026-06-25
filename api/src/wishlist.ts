import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DB } from './db';
import { addWish, removeWish, listWish, mergeWish, setTargetLow, listTargets } from './db';

const nowSec = (): number => Math.floor(Date.now() / 1000);
function uid(req: FastifyRequest): number | undefined {
  return req.session.get('userId') as number | undefined;
}

export function registerWishlist(app: FastifyInstance, db: DB): void {
  app.get('/api/wishlist', async (req, reply) => {
    const u = uid(req);
    if (!u) return reply.code(401).send({ error: 'not_logged_in' });
    return listWish(db, u);
  });
  app.post('/api/wishlist', async (req, reply) => {
    const u = uid(req);
    if (!u) return reply.code(401).send({ error: 'not_logged_in' });
    const { appid } = (req.body ?? {}) as { appid?: number };
    if (!Number.isInteger(appid)) return reply.code(400).send({ error: 'bad_appid' });
    addWish(db, u, appid as number, nowSec());
    return reply.code(201).send({ ok: true });
  });
  app.delete('/api/wishlist/:appid', async (req, reply) => {
    const u = uid(req);
    if (!u) return reply.code(401).send({ error: 'not_logged_in' });
    const appid = Number((req.params as { appid: string }).appid);
    if (!Number.isInteger(appid)) return reply.code(400).send({ error: 'bad_appid' });
    removeWish(db, u, appid);
    return { ok: true };
  });
  app.post('/api/wishlist/merge', async (req, reply) => {
    const u = uid(req);
    if (!u) return reply.code(401).send({ error: 'not_logged_in' });
    const { appids } = (req.body ?? {}) as { appids?: number[] };
    const clean = Array.isArray(appids) ? appids.filter((x): x is number => Number.isInteger(x)) : [];
    mergeWish(db, u, clean, nowSec());
    return listWish(db, u);
  });

  // 目標價:GET 全部、PUT 單款(targetLowCents=null 清除)
  app.get('/api/wishlist/targets', async (req, reply) => {
    const u = uid(req);
    if (!u) return reply.code(401).send({ error: 'not_logged_in' });
    return listTargets(db, u);
  });
  app.put('/api/wishlist/:appid/target', async (req, reply) => {
    const u = uid(req);
    if (!u) return reply.code(401).send({ error: 'not_logged_in' });
    const appid = Number((req.params as { appid: string }).appid);
    if (!Number.isInteger(appid)) return reply.code(400).send({ error: 'bad_appid' });
    const { targetLowCents } = (req.body ?? {}) as { targetLowCents?: number | null };
    if (targetLowCents !== null && (!Number.isInteger(targetLowCents) || (targetLowCents as number) < 0)) {
      return reply.code(400).send({ error: 'bad_target' });
    }
    if (!listWish(db, u).includes(appid)) return reply.code(404).send({ error: 'not_wished' });
    setTargetLow(db, u, appid, targetLowCents ?? null);
    return { ok: true };
  });
}

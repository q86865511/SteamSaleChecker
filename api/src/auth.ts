import type { FastifyInstance } from 'fastify';
import type { DB } from './db';
import { getUserById } from './db';

export function registerAuth(app: FastifyInstance, db: DB): void {
  app.get('/api/me', async (req, reply) => {
    const userId = req.session.get('userId') as number | undefined;
    if (!userId) return reply.code(401).send({ error: 'not_logged_in' });
    const u = getUserById(db, userId);
    if (!u) return reply.code(401).send({ error: 'not_found' });
    return { id: u.id, username: u.username, avatar: u.avatar };
  });
}

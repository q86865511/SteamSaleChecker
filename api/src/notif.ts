import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DB } from './db';
import { getNotifPrefs, putNotifPrefs, userOwnsGuild, mergeGuildRouting, type NotifPrefsPatch } from './db';
import { listGuildChannels, listGuildRoles, textChannelsOnly, mentionableRoles } from './discord';
import { validateGuildRouting } from './bot-connect';
import type { GuildRouting } from '@ssc/shared';

const nowSec = (): number => Math.floor(Date.now() / 1000);
function uid(req: FastifyRequest): number | undefined {
  return req.session.get('userId') as number | undefined;
}

// 解析未受信任的 guild 子物件成部分更新。mention.mode 不合法 → 回 'bad'(整批拒)。
type GuildPatchResult = Partial<GuildRouting> | 'bad';
function parseGuildPatch(raw: unknown): GuildPatchResult {
  if (raw === null || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<GuildRouting> = {};
  const str = (v: unknown): string | null => (v == null ? null : String(v));
  if ('guildId' in r) out.guildId = str(r.guildId);
  if ('channelId' in r) out.channelId = str(r.channelId);
  if ('channels' in r && r.channels && typeof r.channels === 'object') {
    const ch = r.channels as Record<string, unknown>;
    out.channels = { drop: str(ch.drop), free: str(ch.free), digest: str(ch.digest) };
  }
  if ('mention' in r && r.mention && typeof r.mention === 'object') {
    const mn = r.mention as Record<string, unknown>;
    if (mn.mode !== 'none' && mn.mode !== 'self' && mn.mode !== 'role') return 'bad';
    out.mention = { mode: mn.mode, roleId: str(mn.roleId) };
  }
  return out;
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
    const b = (req.body ?? {}) as Record<string, unknown>;
    const p: NotifPrefsPatch = {};
    if (typeof b.dropEnabled === 'boolean') p.dropEnabled = b.dropEnabled;
    if (typeof b.freeEnabled === 'boolean') p.freeEnabled = b.freeEnabled;
    if (b.digestHours !== undefined) {
      if (![0, 24, 168].includes(b.digestHours as number)) return reply.code(400).send({ error: 'bad_digest' });
      p.digestHours = b.digestHours as number;
    }
    if (b.delivery !== undefined) {
      if (b.delivery !== 'channel' && b.delivery !== 'dm' && b.delivery !== 'guild') return reply.code(400).send({ error: 'bad_delivery' });
      p.delivery = b.delivery;
    }
    if (b.genres !== undefined) {
      if (!Array.isArray(b.genres) || !b.genres.every(g => typeof g === 'string')) return reply.code(400).send({ error: 'bad_genres' });
      p.genres = b.genres;
    }
    if (b.guild !== undefined) {
      const gp = parseGuildPatch(b.guild);
      if (gp === 'bad') return reply.code(400).send({ error: 'bad_mention' });
      p.guild = gp;
    }
    // 安全:只要動到 guild 或 delivery 變 guild,就用 bot token 即時驗證所有權/頻道/身分組歸屬。
    if (p.guild !== undefined || p.delivery === 'guild') {
      const cur = getNotifPrefs(db, u);
      const eff = mergeGuildRouting(cur.guild, p.guild);
      const delivery = p.delivery ?? cur.delivery;
      let ownsGuild = false;
      let channelIds = new Set<string>();
      let roleIds = new Set<string>();
      if (eff.guildId) {
        ownsGuild = userOwnsGuild(db, u, eff.guildId);
        if (ownsGuild) {
          const botToken = process.env.DISCORD_BOT_TOKEN ?? '';
          try {
            channelIds = new Set(textChannelsOnly(await listGuildChannels(botToken, eff.guildId)).map(c => c.id));
            roleIds = new Set(mentionableRoles(await listGuildRoles(botToken, eff.guildId), eff.guildId).map(r => r.id));
          } catch { /* 取不到視為空集合;驗證會擋掉所選頻道/身分組 */ }
        }
      }
      const err = validateGuildRouting(delivery, eff, { ownsGuild, channelIds, roleIds });
      if (err) return reply.code(400).send({ error: err });
    }
    putNotifPrefs(db, u, p, nowSec());
    return getNotifPrefs(db, u);
  });
}

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { DB } from './db';
import { recordBotGuild, listBotGuilds, userOwnsGuild, removeBotGuild, getNotifPrefs, putNotifPrefs } from './db';
import {
  BOT_INVITE_PERMISSIONS, buildBotInviteUrl, exchangeCode, listUserGuilds, userCanManageGuild,
  listGuildChannels, listGuildRoles, textChannelsOnly, mentionableRoles, postBotMessage,
} from './discord';
import type { NotifDelivery, GuildRouting } from '@ssc/shared';

declare module '@fastify/secure-session' {
  interface SessionData { botInviteState: string; }
}

const nowSec = (): number => Math.floor(Date.now() / 1000);
const uid = (req: FastifyRequest): number | undefined => req.session.get('userId') as number | undefined;

// 純函式:驗證「合併後」的 guild routing 是否可安全寫入。回 error code 或 null(通過)。
// ownsGuild=該使用者是否擁有 guild.guildId;channelIds/roleIds=該 guild 由 bot token 實際取得的 id 集合。
export interface GuildValidationCtx { ownsGuild: boolean; channelIds: Set<string>; roleIds: Set<string>; }
export function validateGuildRouting(delivery: NotifDelivery, guild: GuildRouting, ctx: GuildValidationCtx): string | null {
  if (!guild.guildId) return delivery === 'guild' ? 'guild_incomplete' : null;
  if (!ctx.ownsGuild) return 'guild_not_owned';
  for (const c of [guild.channelId, guild.channels.drop, guild.channels.free, guild.channels.digest]) {
    if (c && !ctx.channelIds.has(c)) return 'bad_channel';
  }
  if (guild.mention.mode === 'role' && (!guild.mention.roleId || !ctx.roleIds.has(guild.mention.roleId))) return 'bad_role';
  if (delivery === 'guild' && !guild.channelId) return 'guild_incomplete';
  return null;
}

export function registerBotConnect(app: FastifyInstance, db: DB): void {
  const cfg = () => ({
    clientId: process.env.DISCORD_CLIENT_ID ?? '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
    redirectUri: process.env.DISCORD_BOT_INVITE_REDIRECT_URI ?? 'http://localhost:8787/api/bot/invite/callback',
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:4321',
    botToken: process.env.DISCORD_BOT_TOKEN ?? '',
  });

  // 邀請開始:導去 Discord bot 授權頁(scope=bot guilds,帶安裝權限與 CSRF state)。
  app.get('/api/bot/invite', async (req, reply) => {
    const u = uid(req); if (!u) return reply.code(401).send({ error: 'not_logged_in' });
    const c = cfg(); if (!c.clientId) return reply.code(500).send({ error: 'discord_not_configured' });
    const state = randomBytes(16).toString('hex');
    req.session.set('botInviteState', state);
    return reply.redirect(buildBotInviteUrl({ clientId: c.clientId, redirectUri: c.redirectUri, state, permissions: BOT_INVITE_PERMISSIONS }));
  });

  // 邀請回跳:驗 state → 換 code → 用使用者 token 確認其「真的管理該 guild」才登記。
  // 重點:callback 的 guild_id 可偽造,絕不能直接信任,必須靠 listUserGuilds + userCanManageGuild。
  app.get('/api/bot/invite/callback', async (req, reply) => {
    const u = uid(req); const c = cfg();
    const { code, state, guild_id } = req.query as { code?: string; state?: string; guild_id?: string };
    const saved = req.session.get('botInviteState') as string | undefined;
    req.session.set('botInviteState', undefined);
    if (!u || !code || !state || !saved || state !== saved || !guild_id) return reply.redirect(`${c.webOrigin}/settings?bot=error`);
    try {
      const token = await exchangeCode({ code, clientId: c.clientId, clientSecret: c.clientSecret, redirectUri: c.redirectUri });
      const g = (await listUserGuilds(token)).find(x => x.id === guild_id);
      if (!g || !userCanManageGuild(g)) return reply.redirect(`${c.webOrigin}/settings?bot=error`);
      recordBotGuild(db, u, guild_id, g.name, nowSec());
      return reply.redirect(`${c.webOrigin}/settings?bot=connected`);
    } catch {
      return reply.redirect(`${c.webOrigin}/settings?bot=error`);
    }
  });

  // 已連線的伺服器(picker 來源)
  app.get('/api/bot/guilds', async (req, reply) => {
    const u = uid(req); if (!u) return reply.code(401).send({ error: 'not_logged_in' });
    return { guilds: listBotGuilds(db, u) };
  });

  // 該伺服器的文字頻道(bot token);bot 被踢出/權限不足時回空陣列,讓 UI 提示重邀而非 500。
  app.get('/api/bot/guilds/:guildId/channels', async (req, reply) => {
    const u = uid(req); if (!u) return reply.code(401).send({ error: 'not_logged_in' });
    const { guildId } = req.params as { guildId: string };
    if (!userOwnsGuild(db, u, guildId)) return reply.code(403).send({ error: 'guild_not_owned' });
    try {
      const chans = textChannelsOnly(await listGuildChannels(cfg().botToken, guildId));
      return { channels: chans.map(c => ({ id: c.id, name: c.name })) };
    } catch { return { channels: [] }; }
  });

  // 該伺服器可標記的身分組(供 @身分組)
  app.get('/api/bot/guilds/:guildId/roles', async (req, reply) => {
    const u = uid(req); if (!u) return reply.code(401).send({ error: 'not_logged_in' });
    const { guildId } = req.params as { guildId: string };
    if (!userOwnsGuild(db, u, guildId)) return reply.code(403).send({ error: 'guild_not_owned' });
    try {
      const roles = mentionableRoles(await listGuildRoles(cfg().botToken, guildId), guildId);
      return { roles: roles.map(r => ({ id: r.id, name: r.name })) };
    } catch { return { roles: [] }; }
  });

  // 測試通知:對使用者目前選定的統一頻道實際送一則 embed,驗證 bot 在該頻道有發送/嵌入權限。
  app.post('/api/bot/test', async (req, reply) => {
    const u = uid(req); if (!u) return reply.code(401).send({ error: 'not_logged_in' });
    const channelId = getNotifPrefs(db, u).guild.channelId;
    if (!channelId) return reply.code(400).send({ ok: false, reason: 'no_channel' });
    const payload = { embeds: [{
      title: 'SteamSaleChecker 測試通知',
      description: '看到這則訊息代表機器人已能在此頻道發送特價通知 ✅',
      color: 0x66c0f4,
    }] };
    try {
      const status = await postBotMessage(cfg().botToken, channelId, payload);
      if (status >= 200 && status < 300) return { ok: true };
      const reason = status === 403 ? 'forbidden' : status === 404 ? 'no_channel' : 'error';
      return reply.code(200).send({ ok: false, reason });
    } catch { return reply.code(200).send({ ok: false, reason: 'error' }); }
  });

  // 解除伺服器連線:清掉路由、delivery 退回全域頻道;可選 guildId 同時移除該邀請紀錄。
  app.post('/api/bot/disconnect', async (req, reply) => {
    const u = uid(req); if (!u) return reply.code(401).send({ error: 'not_logged_in' });
    const { guildId } = (req.body ?? {}) as { guildId?: string };
    if (guildId) removeBotGuild(db, u, guildId);
    putNotifPrefs(db, u, {
      delivery: 'channel',
      guild: { guildId: null, channelId: null, channels: { drop: null, free: null, digest: null } },
    }, nowSec());
    return { ok: true };
  });
}

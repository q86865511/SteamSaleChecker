import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import {
  ensureAuthTables, getNotifPrefs, putNotifPrefs,
  recordBotGuild, listBotGuilds, userOwnsGuild, removeBotGuild,
} from './db';
import { DEFAULT_GUILD_ROUTING } from '@ssc/shared';

function freshDb() { const db = new Database(':memory:'); ensureAuthTables(db); return db; }

describe('notif prefs data layer', () => {
  it('無列回預設', () => {
    const db = freshDb();
    expect(getNotifPrefs(db, 1)).toEqual({ dropEnabled: true, freeEnabled: false, digestHours: 0, delivery: 'channel', genres: [], guild: DEFAULT_GUILD_ROUTING });
  });
  it('put 部分欄位合併、再讀回', () => {
    const db = freshDb();
    putNotifPrefs(db, 1, { freeEnabled: true, digestHours: 24 }, 1000);
    expect(getNotifPrefs(db, 1)).toMatchObject({ dropEnabled: true, freeEnabled: true, digestHours: 24, delivery: 'channel' });
    putNotifPrefs(db, 1, { delivery: 'dm', dropEnabled: false }, 2000);
    expect(getNotifPrefs(db, 1)).toMatchObject({ dropEnabled: false, freeEnabled: true, digestHours: 24, delivery: 'dm' });
  });
  it('genres 全量取代(空清除)', () => {
    const db = freshDb();
    putNotifPrefs(db, 1, { genres: ['動作', 'RPG'] }, 1000);
    expect(getNotifPrefs(db, 1).genres.slice().sort()).toEqual(['動作', 'RPG'].sort());
    putNotifPrefs(db, 1, { genres: ['策略'] }, 2000);
    expect(getNotifPrefs(db, 1).genres).toEqual(['策略']);
    putNotifPrefs(db, 1, { genres: [] }, 3000);
    expect(getNotifPrefs(db, 1).genres).toEqual([]);
  });
  it('未提供 genres 時不動既有 genres', () => {
    const db = freshDb();
    putNotifPrefs(db, 1, { genres: ['動作'] }, 1000);
    putNotifPrefs(db, 1, { digestHours: 168 }, 2000);
    expect(getNotifPrefs(db, 1).genres).toEqual(['動作']);
  });
  it('prefs 為 per-user', () => {
    const db = freshDb();
    putNotifPrefs(db, 1, { delivery: 'dm' }, 1000);
    expect(getNotifPrefs(db, 2).delivery).toBe('channel');
  });
});

describe('guild 路由 prefs', () => {
  it('delivery=guild 不被 ternary 吃成 channel,並 join 出 guildName', () => {
    const db = freshDb();
    recordBotGuild(db, 1, 'g1', 'My Server', 100);
    putNotifPrefs(db, 1, { delivery: 'guild', guild: { guildId: 'g1', channelId: 'c1' } }, 1000);
    const p = getNotifPrefs(db, 1);
    expect(p.delivery).toBe('guild');
    expect(p.guild.guildId).toBe('g1');
    expect(p.guild.channelId).toBe('c1');
    expect(p.guild.guildName).toBe('My Server');
  });
  it('per-type 覆蓋與 mention round-trip', () => {
    const db = freshDb();
    recordBotGuild(db, 1, 'g1', 'S', 100);
    putNotifPrefs(db, 1, { delivery: 'guild', guild: { guildId: 'g1', channelId: 'c1', channels: { drop: 'cd', free: null, digest: 'cg' }, mention: { mode: 'role', roleId: 'r9' } } }, 1000);
    const p = getNotifPrefs(db, 1);
    expect(p.guild.channels).toEqual({ drop: 'cd', free: null, digest: 'cg' });
    expect(p.guild.mention).toEqual({ mode: 'role', roleId: 'r9' });
  });
  it('部分更新不清掉未提供的 guild 欄位', () => {
    const db = freshDb();
    recordBotGuild(db, 1, 'g1', 'S', 100);
    putNotifPrefs(db, 1, { guild: { guildId: 'g1', channelId: 'c1', mention: { mode: 'self', roleId: null } } }, 1000);
    putNotifPrefs(db, 1, { dropEnabled: false }, 2000);
    const p = getNotifPrefs(db, 1);
    expect(p.guild.guildId).toBe('g1');
    expect(p.guild.channelId).toBe('c1');
    expect(p.guild.mention.mode).toBe('self');
  });
  it('channelId 可被顯式清為 null', () => {
    const db = freshDb();
    recordBotGuild(db, 1, 'g1', 'S', 100);
    putNotifPrefs(db, 1, { guild: { guildId: 'g1', channelId: 'c1' } }, 1000);
    putNotifPrefs(db, 1, { guild: { channelId: null } }, 2000);
    expect(getNotifPrefs(db, 1).guild.channelId).toBeNull();
  });
});

describe('user_bot_guilds CRUD(picker + 所有權白名單)', () => {
  it('record / list / own / remove', () => {
    const db = freshDb();
    recordBotGuild(db, 1, 'g1', 'Alpha', 100);
    recordBotGuild(db, 1, 'g2', 'Beta', 200);
    recordBotGuild(db, 2, 'g3', 'Gamma', 300);
    expect(listBotGuilds(db, 1).map(g => g.guildId).sort()).toEqual(['g1', 'g2']);
    expect(userOwnsGuild(db, 1, 'g1')).toBe(true);
    expect(userOwnsGuild(db, 1, 'g3')).toBe(false); // 別人邀請的 guild
    expect(userOwnsGuild(db, 2, 'g3')).toBe(true);
    removeBotGuild(db, 1, 'g1');
    expect(userOwnsGuild(db, 1, 'g1')).toBe(false);
  });
  it('重複 record 同一 guild 只更新名稱', () => {
    const db = freshDb();
    recordBotGuild(db, 1, 'g1', 'Old', 100);
    recordBotGuild(db, 1, 'g1', 'New', 200);
    expect(listBotGuilds(db, 1)).toEqual([{ guildId: 'g1', guildName: 'New' }]);
  });
});

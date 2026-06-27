import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import {
  ensureAuthTables, getUserById, upsertUser,
  addWish, removeWish, listWish, mergeWish,
  setTargetLow, listTargets,
  recordBotGuild, listBotGuilds, userOwnsGuild, removeBotGuild,
  getNotifPrefs, putNotifPrefs, mergeGuildRouting,
  type DB,
} from './db';
import type { GuildRouting } from '@ssc/shared';

const fresh = (): DB => { const db = new Database(':memory:'); ensureAuthTables(db); return db; };

describe('ensureAuthTables / migration', () => {
  it('建立全部資料表', () => {
    const db = fresh();
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name);
    for (const t of ['users', 'wishlist', 'notif_prefs', 'notif_genres', 'user_bot_guilds']) expect(tables).toContain(t);
  });
  it('遷移欄位存在(target_low_cents / guild 路由欄)', () => {
    const db = fresh();
    const wl = (db.prepare('PRAGMA table_info(wishlist)').all() as { name: string }[]).map(c => c.name);
    expect(wl).toContain('target_low_cents');
    const np = (db.prepare('PRAGMA table_info(notif_prefs)').all() as { name: string }[]).map(c => c.name);
    for (const c of ['guild_id', 'guild_channel_id', 'ch_drop', 'ch_free', 'ch_digest', 'mention_mode', 'mention_role_id']) expect(np).toContain(c);
  });
  it('重複呼叫具冪等性(不重複加欄、不報錯)', () => {
    const db = fresh();
    expect(() => { ensureAuthTables(db); ensureAuthTables(db); }).not.toThrow();
    const np = (db.prepare('PRAGMA table_info(notif_prefs)').all() as { name: string }[]).filter(c => c.name === 'guild_id');
    expect(np.length).toBe(1);
  });
});

describe('users', () => {
  it('upsertUser 新增回傳 id;getUserById 取回', () => {
    const db = fresh();
    const id = upsertUser(db, { id: 'd1', username: 'Alice', avatar: null });
    const u = getUserById(db, id);
    expect(u).toMatchObject({ id, discord_id: 'd1', username: 'Alice', avatar: null });
  });
  it('同一 discord_id upsert 保留 id、更新 username/avatar', () => {
    const db = fresh();
    const id1 = upsertUser(db, { id: 'd1', username: 'Alice', avatar: null });
    const id2 = upsertUser(db, { id: 'd1', username: 'Alice2', avatar: 'av' });
    expect(id2).toBe(id1);
    expect(getUserById(db, id1)).toMatchObject({ username: 'Alice2', avatar: 'av' });
  });
  it('不同 discord_id 各自獨立 id', () => {
    const db = fresh();
    expect(upsertUser(db, { id: 'a', username: 'A', avatar: null }))
      .not.toBe(upsertUser(db, { id: 'b', username: 'B', avatar: null }));
  });
  it('getUserById 未知 id 回 undefined', () => {
    expect(getUserById(fresh(), 999)).toBeUndefined();
  });
});

describe('wishlist', () => {
  it('addWish 冪等(同款重複加不重複)、removeWish 移除', () => {
    const db = fresh();
    addWish(db, 1, 100, 10); addWish(db, 1, 100, 20);
    expect(listWish(db, 1)).toEqual([100]);
    removeWish(db, 1, 100);
    expect(listWish(db, 1)).toEqual([]);
  });
  it('listWish 依 added_at DESC、同時間以 appid 升冪', () => {
    const db = fresh();
    addWish(db, 1, 1, 10); addWish(db, 1, 3, 20); addWish(db, 1, 2, 20);
    expect(listWish(db, 1)).toEqual([2, 3, 1]);
  });
  it('wishlist 依 user 隔離', () => {
    const db = fresh();
    addWish(db, 1, 100, 10); addWish(db, 2, 200, 10);
    expect(listWish(db, 1)).toEqual([100]);
    expect(listWish(db, 2)).toEqual([200]);
  });
  it('mergeWish 批次併入且冪等', () => {
    const db = fresh();
    mergeWish(db, 1, [1, 2, 3], 10);
    mergeWish(db, 1, [3, 4], 20);
    expect(listWish(db, 1).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });
});

describe('target price', () => {
  it('setTargetLow 設定後 listTargets 反映;null 清除', () => {
    const db = fresh();
    addWish(db, 1, 50, 10);
    setTargetLow(db, 1, 50, 1000);
    expect(listTargets(db, 1)).toEqual({ 50: 1000 });
    setTargetLow(db, 1, 50, null);
    expect(listTargets(db, 1)).toEqual({});
  });
  it('listTargets 只回有設目標價者', () => {
    const db = fresh();
    addWish(db, 1, 50, 10); addWish(db, 1, 60, 10);
    setTargetLow(db, 1, 60, 500);
    expect(listTargets(db, 1)).toEqual({ 60: 500 });
  });
  it('對未收藏的 appid setTargetLow 不影響(UPDATE 0 列)', () => {
    const db = fresh();
    setTargetLow(db, 1, 999, 1000);
    expect(listTargets(db, 1)).toEqual({});
  });
});

describe('user_bot_guilds', () => {
  it('recordBotGuild upsert:同 guild 重記更新名稱、不重複列', () => {
    const db = fresh();
    recordBotGuild(db, 1, 'g1', 'Alpha', 10);
    recordBotGuild(db, 1, 'g1', 'AlphaRenamed', 20);
    const gs = listBotGuilds(db, 1);
    expect(gs).toEqual([{ guildId: 'g1', guildName: 'AlphaRenamed' }]);
  });
  it('listBotGuilds 依 joined_at DESC', () => {
    const db = fresh();
    recordBotGuild(db, 1, 'g1', 'A', 10);
    recordBotGuild(db, 1, 'g2', 'B', 20);
    expect(listBotGuilds(db, 1).map(g => g.guildId)).toEqual(['g2', 'g1']);
  });
  it('userOwnsGuild 反映擁有權;removeBotGuild 後為 false', () => {
    const db = fresh();
    recordBotGuild(db, 1, 'g1', 'A', 10);
    expect(userOwnsGuild(db, 1, 'g1')).toBe(true);
    expect(userOwnsGuild(db, 2, 'g1')).toBe(false);
    expect(userOwnsGuild(db, 1, 'gX')).toBe(false);
    removeBotGuild(db, 1, 'g1');
    expect(userOwnsGuild(db, 1, 'g1')).toBe(false);
  });
});

describe('mergeGuildRouting(純函式)', () => {
  const cur: GuildRouting = {
    guildId: 'g', guildName: 'G', channelId: 'c0',
    channels: { drop: 'd0', free: 'f0', digest: 'g0' }, mention: { mode: 'self', roleId: 'r0' },
  };
  it('patch undefined → 原樣保留', () => {
    expect(mergeGuildRouting(cur, undefined)).toEqual(cur);
  });
  it('null 清除、undefined 保留(關鍵區分)', () => {
    const out = mergeGuildRouting(cur, { channelId: null });
    expect(out.channelId).toBeNull();
    expect(out.guildId).toBe('g'); // 未提供者保留
  });
  it('提供值覆蓋', () => {
    expect(mergeGuildRouting(cur, { channelId: 'cNew' }).channelId).toBe('cNew');
  });
  it('channels 逐欄合併(只動有提供者)', () => {
    const out = mergeGuildRouting(cur, { channels: { drop: 'dNew' } as GuildRouting['channels'] });
    expect(out.channels).toEqual({ drop: 'dNew', free: 'f0', digest: 'g0' });
  });
  it('mention 逐欄合併', () => {
    const out = mergeGuildRouting(cur, { mention: { mode: 'role' } as GuildRouting['mention'] });
    expect(out.mention).toEqual({ mode: 'role', roleId: 'r0' });
  });
});

describe('notif prefs', () => {
  it('無紀錄回預設(drop 開、free 關、digest 0、channel、空 genres、空 guild)', () => {
    const p = getNotifPrefs(fresh(), 1);
    expect(p).toMatchObject({ dropEnabled: true, freeEnabled: false, digestHours: 0, delivery: 'channel', genres: [] });
    expect(p.guild.guildId).toBeNull();
  });
  it('putNotifPrefs 部分更新:只覆蓋有提供者', () => {
    const db = fresh();
    putNotifPrefs(db, 1, { dropEnabled: false }, 100);
    const p = getNotifPrefs(db, 1);
    expect(p.dropEnabled).toBe(false);
    expect(p.freeEnabled).toBe(false); // 未提供者維持預設
    expect(p.digestHours).toBe(0);
  });
  it('delivery=guild/dm 原樣帶出', () => {
    const db = fresh();
    putNotifPrefs(db, 1, { delivery: 'guild' }, 100);
    expect(getNotifPrefs(db, 1).delivery).toBe('guild');
    putNotifPrefs(db, 1, { delivery: 'dm' }, 110);
    expect(getNotifPrefs(db, 1).delivery).toBe('dm');
  });
  it('未知 delivery 值落回 channel(防禦)', () => {
    const db = fresh();
    putNotifPrefs(db, 1, { delivery: 'channel' }, 100);
    db.prepare('UPDATE notif_prefs SET delivery = ? WHERE user_id = 1').run('bogus');
    expect(getNotifPrefs(db, 1).delivery).toBe('channel');
  });
  it('guild routing 寫入 + guildName 由 user_bot_guilds 帶回', () => {
    const db = fresh();
    recordBotGuild(db, 1, 'g1', 'MyGuild', 10);
    putNotifPrefs(db, 1, { delivery: 'guild', guild: { guildId: 'g1', channelId: 'c1' } }, 100);
    const g = getNotifPrefs(db, 1).guild;
    expect(g).toMatchObject({ guildId: 'g1', guildName: 'MyGuild', channelId: 'c1' });
  });
  it('genres:提供時取代、未提供時保留', () => {
    const db = fresh();
    putNotifPrefs(db, 1, { genres: ['Action', 'RPG'] }, 100);
    expect(getNotifPrefs(db, 1).genres).toEqual(['Action', 'RPG']); // ORDER BY genre
    putNotifPrefs(db, 1, { dropEnabled: false }, 110); // 未動 genres
    expect(getNotifPrefs(db, 1).genres).toEqual(['Action', 'RPG']);
    putNotifPrefs(db, 1, { genres: [] }, 120); // 顯式清空
    expect(getNotifPrefs(db, 1).genres).toEqual([]);
  });
  it('guild 子欄位 null 可清除既有路由', () => {
    const db = fresh();
    recordBotGuild(db, 1, 'g1', 'G', 10);
    putNotifPrefs(db, 1, { guild: { guildId: 'g1', channelId: 'c1' } }, 100);
    putNotifPrefs(db, 1, { guild: { channelId: null } }, 110);
    const g = getNotifPrefs(db, 1).guild;
    expect(g.channelId).toBeNull();
    expect(g.guildId).toBe('g1'); // 未提供者保留
  });
});

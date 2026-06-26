import { describe, it, expect } from 'vitest';
import {
  buildAuthorizeUrl, buildBotInviteUrl, BOT_INVITE_PERMISSIONS, textChannelsOnly, mentionableRoles,
  userCanManageGuild,
} from './discord';

describe('buildAuthorizeUrl', () => {
  it('組出正確的 Discord 授權 URL', () => {
    const url = buildAuthorizeUrl({ clientId: 'abc123', redirectUri: 'http://localhost:8787/auth/callback', state: 'xyz' });
    expect(url.startsWith('https://discord.com/api/oauth2/authorize?')).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get('response_type')).toBe('code');
    expect(q.get('client_id')).toBe('abc123');
    expect(q.get('redirect_uri')).toBe('http://localhost:8787/auth/callback');
    expect(q.get('scope')).toBe('identify guilds.join');
    expect(q.get('state')).toBe('xyz');
  });
});

describe('buildBotInviteUrl', () => {
  it('權限整數 = VIEW_CHANNEL+SEND_MESSAGES+EMBED_LINKS = 19456', () => {
    expect(BOT_INVITE_PERMISSIONS).toBe(19456);
  });
  it('用 scope=bot guilds + response_type=code 才會 redirect 回來帶 guild_id', () => {
    const url = buildBotInviteUrl({ clientId: 'cid', redirectUri: 'http://localhost:8787/api/bot/invite/callback', state: 'st' });
    expect(url.startsWith('https://discord.com/api/oauth2/authorize?')).toBe(true);
    const q = new URL(url).searchParams;
    // scope 必須含 bot 與 guilds(純 scope=bot 是 callback-less、不會回跳)
    expect(q.get('scope')!.split(' ').sort()).toEqual(['bot', 'guilds']);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('client_id')).toBe('cid');
    expect(q.get('redirect_uri')).toBe('http://localhost:8787/api/bot/invite/callback');
    expect(q.get('permissions')).toBe('19456');
    expect(q.get('state')).toBe('st');
  });
});

describe('textChannelsOnly', () => {
  const chs = [
    { id: '1', name: 'general', type: 0, position: 2 },
    { id: '2', name: 'voice', type: 2, position: 0 },          // 語音:排除
    { id: '3', name: 'announce', type: 5, position: 1 },       // 公告:保留
    { id: '4', name: 'category', type: 4, position: 0 },       // 分類:排除
  ];
  it('只留文字/公告頻道(type 0/5),依 position 排序', () => {
    const out = textChannelsOnly(chs);
    expect(out.map(c => c.id)).toEqual(['3', '1']); // announce(pos1) 在 general(pos2) 前
  });
});

describe('mentionableRoles', () => {
  const guildId = 'g1';
  const roles = [
    { id: 'g1', name: '@everyone', position: 0, managed: false }, // @everyone(id===guildId):排除
    { id: 'r2', name: 'Bot Role', position: 1, managed: true },   // managed:排除
    { id: 'r3', name: 'Members', position: 3, managed: false },
    { id: 'r4', name: 'VIP', position: 2, managed: false },
  ];
  it('去掉 @everyone 與 managed,依 position 由高到低', () => {
    const out = mentionableRoles(roles, guildId);
    expect(out.map(r => r.id)).toEqual(['r3', 'r4']);
  });
});

describe('userCanManageGuild(安全:callback guild_id 可偽造,須驗使用者真有管理權)', () => {
  it('owner=true → 可', () => expect(userCanManageGuild({ owner: true, permissions: '0' })).toBe(true));
  it('permissions 含 MANAGE_GUILD(0x20)→ 可', () => {
    expect(userCanManageGuild({ owner: false, permissions: '32' })).toBe(true);
    expect(userCanManageGuild({ owner: false, permissions: '8' })).toBe(false); // 只有 ADMIN 以外的其他位
  });
  it('大數字 bitfield 也能正確判斷', () => {
    expect(userCanManageGuild({ owner: false, permissions: '562949953421311' })).toBe(true); // 含 0x20
  });
  it('無 permissions/壞值 → 否', () => {
    expect(userCanManageGuild({ owner: false })).toBe(false);
    expect(userCanManageGuild({ owner: false, permissions: 'xyz' })).toBe(false);
  });
});

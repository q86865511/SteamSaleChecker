import { describe, it, expect } from 'vitest';
import { resolveTarget, mentionPrefix, allowedMentionsFor } from './route';
import { DEFAULT_GUILD_ROUTING, type GuildRouting } from '@ssc/shared';

const GLOBAL = 'globalCh';
const guild = (over: Partial<GuildRouting> = {}): GuildRouting => ({ ...DEFAULT_GUILD_ROUTING, ...over });

describe('resolveTarget', () => {
  it('dm → DM,不需頻道', () => {
    expect(resolveTarget('dm', guild(), 'drop', GLOBAL)).toEqual({ kind: 'dm', channelId: null, useGuildMention: false });
  });
  it('channel(全域)→ 全域頻道,不用 guild mention', () => {
    expect(resolveTarget('channel', guild(), 'drop', GLOBAL)).toEqual({ kind: 'channel', channelId: GLOBAL, useGuildMention: false });
  });
  it('guild 統一:無 per-type 覆蓋 → 用 channelId,套 guild mention', () => {
    const g = guild({ guildId: 'g1', channelId: 'uni' });
    expect(resolveTarget('guild', g, 'free', GLOBAL)).toEqual({ kind: 'channel', channelId: 'uni', useGuildMention: true });
  });
  it('guild 分流:有 per-type 覆蓋 → 用該類型頻道', () => {
    const g = guild({ guildId: 'g1', channelId: 'uni', channels: { drop: 'cd', free: null, digest: 'cg' } });
    expect(resolveTarget('guild', g, 'drop', GLOBAL).channelId).toBe('cd');
    expect(resolveTarget('guild', g, 'free', GLOBAL).channelId).toBe('uni'); // free 未覆蓋 → 沿用統一
    expect(resolveTarget('guild', g, 'digest', GLOBAL).channelId).toBe('cg');
  });
  it('guild 設定不全(缺 guildId 或 channelId)→ fall back 全域,不套 guild mention', () => {
    expect(resolveTarget('guild', guild({ guildId: 'g1' }), 'drop', GLOBAL))
      .toEqual({ kind: 'channel', channelId: GLOBAL, useGuildMention: false });
    expect(resolveTarget('guild', guild({ channelId: 'uni' }), 'drop', GLOBAL))
      .toEqual({ kind: 'channel', channelId: GLOBAL, useGuildMention: false });
  });
});

describe('mentionPrefix', () => {
  it('none → 空字串', () => expect(mentionPrefix({ mode: 'none', roleId: null }, '7')).toBe(''));
  it('self → <@userId>', () => expect(mentionPrefix({ mode: 'self', roleId: null }, '7')).toBe('<@7>'));
  it('role → <@&roleId>', () => expect(mentionPrefix({ mode: 'role', roleId: 'r9' }, '7')).toBe('<@&r9>'));
  it('role 但 roleId 為 null → 空字串(不誤 ping)', () => expect(mentionPrefix({ mode: 'role', roleId: null }, '7')).toBe(''));
});

describe('allowedMentionsFor', () => {
  it('none → 空白名單', () => expect(allowedMentionsFor({ mode: 'none', roleId: null }, '7')).toEqual({ parse: [] }));
  it('self → 只允許該使用者', () => expect(allowedMentionsFor({ mode: 'self', roleId: null }, '7')).toEqual({ users: ['7'] }));
  it('role → 只允許該身分組', () => expect(allowedMentionsFor({ mode: 'role', roleId: 'r9' }, '7')).toEqual({ roles: ['r9'] }));
  it('role 但 roleId 為 null → 空白名單', () => expect(allowedMentionsFor({ mode: 'role', roleId: null }, '7')).toEqual({ parse: [] }));
});

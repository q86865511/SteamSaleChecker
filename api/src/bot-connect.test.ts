import { describe, it, expect } from 'vitest';
import { validateGuildRouting } from './bot-connect';
import { DEFAULT_GUILD_ROUTING, type GuildRouting } from '@ssc/shared';

const g = (o: Partial<GuildRouting> = {}): GuildRouting => ({ ...DEFAULT_GUILD_ROUTING, ...o });
const ctx = (o: Partial<{ ownsGuild: boolean; channelIds: Set<string>; roleIds: Set<string> }> = {}) =>
  ({ ownsGuild: true, channelIds: new Set<string>(), roleIds: new Set<string>(), ...o });

describe('validateGuildRouting(寫入前安全驗證)', () => {
  it('未選 guild + delivery 非 guild → 通過', () => {
    expect(validateGuildRouting('channel', g(), ctx())).toBeNull();
  });
  it('delivery=guild 但未選 guild → guild_incomplete', () => {
    expect(validateGuildRouting('guild', g(), ctx())).toBe('guild_incomplete');
  });
  it('選了 guild 但非本人邀請/擁有 → guild_not_owned(防灌入他人伺服器)', () => {
    expect(validateGuildRouting('channel', g({ guildId: 'g1', channelId: 'c1' }), ctx({ ownsGuild: false }))).toBe('guild_not_owned');
  });
  it('統一頻道不屬於該 guild → bad_channel', () => {
    expect(validateGuildRouting('guild', g({ guildId: 'g1', channelId: 'c1' }), ctx({ channelIds: new Set(['cX']) }))).toBe('bad_channel');
  });
  it('per-type 頻道不屬於該 guild → bad_channel', () => {
    const guild = g({ guildId: 'g1', channelId: 'c1', channels: { drop: 'cBad', free: null, digest: null } });
    expect(validateGuildRouting('guild', guild, ctx({ channelIds: new Set(['c1']) }))).toBe('bad_channel');
  });
  it('mention=role 但 roleId 不屬於該 guild → bad_role(防 @ 任意身分組)', () => {
    const guild = g({ guildId: 'g1', channelId: 'c1', mention: { mode: 'role', roleId: 'rX' } });
    expect(validateGuildRouting('guild', guild, ctx({ channelIds: new Set(['c1']), roleIds: new Set(['r1']) }))).toBe('bad_role');
  });
  it('delivery=guild 但沒選統一頻道 → guild_incomplete', () => {
    expect(validateGuildRouting('guild', g({ guildId: 'g1', channelId: null }), ctx())).toBe('guild_incomplete');
  });
  it('全部合法 → null', () => {
    const guild = g({ guildId: 'g1', channelId: 'c1', channels: { drop: 'c2', free: null, digest: null }, mention: { mode: 'role', roleId: 'r1' } });
    expect(validateGuildRouting('guild', guild, ctx({ channelIds: new Set(['c1', 'c2']), roleIds: new Set(['r1']) }))).toBeNull();
  });
});

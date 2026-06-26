import type { NotifDelivery, NotifType, GuildRouting, MentionConfig } from '@ssc/shared';

// 解析「某使用者 × 某通知類型」要送去哪。純函式,便於 TDD。
// delivery:'dm'→私訊;'channel'→全域頻道(globalChannelId);'guild'→使用者自選伺服器。
// per-type 覆蓋為 null 時回退統一 channelId;guild 設定不全(缺 guildId/channelId)時 fall back 全域。
export interface ResolvedTarget {
  kind: 'dm' | 'channel';
  channelId: string | null;   // kind==='dm' 時為 null
  useGuildMention: boolean;   // 是否套用使用者的 guild mention 設定(僅 guild 路由為真)
}
export function resolveTarget(
  delivery: NotifDelivery, guild: GuildRouting, type: NotifType, globalChannelId: string,
): ResolvedTarget {
  if (delivery === 'dm') return { kind: 'dm', channelId: null, useGuildMention: false };
  if (delivery === 'guild' && guild.guildId && guild.channelId) {
    return { kind: 'channel', channelId: guild.channels[type] ?? guild.channelId, useGuildMention: true };
  }
  return { kind: 'channel', channelId: globalChannelId, useGuildMention: false };
}

// mention 前綴(放進訊息 content):none='' / self='<@userId>' / role='<@&roleId>'。
export function mentionPrefix(m: MentionConfig, userDiscordId: string): string {
  if (m.mode === 'self') return `<@${userDiscordId}>`;
  if (m.mode === 'role' && m.roleId) return `<@&${m.roleId}>`;
  return '';
}

// 對應 Discord allowed_mentions:self→只該使用者、role→只該身分組、其餘→空白名單(完全不 ping)。
export type AllowSpec = { parse: [] } | { users: string[] } | { roles: string[] };
export function allowedMentionsFor(m: MentionConfig, userDiscordId: string): AllowSpec {
  if (m.mode === 'self') return { users: [userDiscordId] };
  if (m.mode === 'role' && m.roleId) return { roles: [m.roleId] };
  return { parse: [] };
}

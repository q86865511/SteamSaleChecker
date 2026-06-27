import { formatTwd, parsePlatforms, type Deal, type ReviewSummary } from '@ssc/shared';

// --- Discord 訊息型別(最小集合,夠用即可)---
export interface DiscordEmbedField { name: string; value: string; inline?: boolean; }
export interface DiscordEmbed {
  title?: string; url?: string; description?: string; color?: number;
  author?: { name: string; icon_url?: string };
  footer?: { text: string; icon_url?: string };
  image?: { url: string };
  thumbnail?: { url: string };
  fields?: DiscordEmbedField[];
}
export interface DiscordLinkButton { type: 2; style: 5; label: string; url: string; }
export interface DiscordActionRow { type: 1; components: DiscordLinkButton[]; }
export interface MessagePayload { content?: string; embeds?: DiscordEmbed[]; components?: DiscordActionRow[]; }

// 顏色(Steam 商店風格;十進位給 Discord)。可再微調。
export const COLORS = {
  free: 0x66c0f4,   // Steam 藍
  drop: 0xe24b4a,   // 紅:史低降價
  target: 0x3ba55d, // 綠:跌破目標價
  digest: 0xf0a020, // 金:特價精選
};
// Discord 欄位上限
const MAX_TITLE = 256, MAX_DESC = 4096;

const SITE_URL = 'https://steam.terrychou.com/';

// chip = Discord inline-code(灰底圓角)。去掉反引號/換行,避免外部字串破出 code span 注入 markdown。
export const chip = (s: string): string => `\`${String(s).replace(/`/g, "'").replace(/[\r\n]+/g, ' ')}\``;
// 截斷到 Discord 上限(超出加省略號),避免過長外部字串使整則訊息被 400 拒絕。
const clamp = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const tsFull = (unix: number): string => `<t:${unix}:F>`;
export const tsRel = (unix: number): string => `<t:${unix}:R>`;
// 領取截止:絕對日期 + 相對倒數,皆由 Discord 依檢視者在地化呈現。
export const deadlineMarkup = (unix: number): string => `${tsFull(unix)}（${tsRel(unix)}）`;

const isHttp = (u?: string | null): u is string => !!u && /^https?:\/\//i.test(u);

// GamerPower end_date('YYYY-MM-DD HH:MM:SS')或 ISO → unix 秒。無時區一律視為 UTC
// (避免測試/結果隨機器時區改變);'N/A'/null/不可解析/超出範圍(rollover)回 null。
export function parseEndDate(s?: string | null): number | null {
  if (!s || s === 'N/A') return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [Y, Mo, D, H, Mi, Se] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? '0')];
  const ms = Date.UTC(Y, Mo - 1, D, H, Mi, Se);
  const d = new Date(ms);
  // 回推驗證:任何超出範圍(月 13、日 45、時 99…)都會被 Date.UTC 滾動,與原值不符 → null。
  if (d.getUTCFullYear() !== Y || d.getUTCMonth() !== Mo - 1 || d.getUTCDate() !== D ||
      d.getUTCHours() !== H || d.getUTCMinutes() !== Mi) return null;
  return Math.floor(ms / 1000);
}

// 價格行:原價刪線 → 特價/免費(粗體)。
export function priceLine(regularCents: number, finalCents: number): string {
  if (finalCents <= 0) {
    return regularCents > 0 ? `~~${formatTwd(regularCents)}~~ → **NT$ 0(免費)**` : '**免費**';
  }
  if (regularCents > finalCents) return `~~${formatTwd(regularCents)}~~ → **${formatTwd(finalCents)}**`;
  return `**${formatTwd(finalCents)}**`;
}

const reviewChip = (r?: ReviewSummary | null): string | null =>
  r ? chip(`${r.scoreDesc}（${r.positivePct}%）`) : null;

const linkButton = (label: string, url: string): DiscordActionRow[] =>
  [{ type: 1, components: [{ type: 2, style: 5, label, url }] }];

const mentionContent = (mention?: string): string | undefined =>
  mention ? `<@${mention}>` : undefined;

// 訊息 content 的提及字串:mentionText 有給(含 '')時優先 —— '' 代表不提及(content undefined);
// 未給時沿用舊行為 <@mention>。讓 guild 路由能用 self/role/none,且不破壞既有呼叫端。
const resolveContent = (mentionText: string | undefined, mention?: string): string | undefined =>
  mentionText !== undefined ? (mentionText || undefined) : mentionContent(mention);

export interface GiveawayInput {
  title: string; url: string; type: string; platforms: string;
  end_date?: string | null; worth_usd?: string | null; image?: string | null;
}
// Steam 補強(完整版用):贈送一律「免費領取」,regularCents 為 Steam 原價(刪線);
// 不沿用 Steam 現價/折扣,因 giveaway 與商店是否在特價無關(否則 key giveaway 會顯示全價)。
export interface GiveawayEnrich {
  appid: number; headerImage: string; regularCents: number; review?: ReviewSummary | null;
}
export interface BuildOpts { mention?: string; mentionText?: string; steamIcon?: string; }

// 免費領取 embed。enrich 有值=Steam 完整版、null=精簡版(GamerPower 資料)。
export function buildGiveawayEmbed(g: GiveawayInput, enrich: GiveawayEnrich | null, opts: BuildOpts = {}): MessagePayload {
  const isDlc = g.type?.toLowerCase() === 'dlc';
  const end = parseEndDate(g.end_date);
  const lines: string[] = ['**領取資訊**'];
  const embed: DiscordEmbed = {
    color: COLORS.free,
    title: clamp(g.title, MAX_TITLE),
    url: isHttp(g.url) ? g.url : undefined,
  };

  if (enrich) {
    embed.author = { name: isDlc ? 'STEAM 免費 DLC 領取' : 'STEAM 免費遊戲領取', icon_url: opts.steamIcon };
    if (enrich.regularCents > 0) lines.push(`${chip('折扣')} ${chip('-100%')}`);
    lines.push(`${chip('價格')} ${priceLine(enrich.regularCents, 0)}`); // 領取一律免費
    if (end) lines.push(`${chip('領取截止')} ${deadlineMarkup(end)}`);
    const rc = reviewChip(enrich.review);
    if (rc) lines.push(`${chip('整體評價')} ${rc}`);
    if (isHttp(enrich.headerImage)) embed.image = { url: enrich.headerImage };
    embed.footer = { text: '資料來源:Steam Store', icon_url: opts.steamIcon };
  } else {
    embed.author = { name: isDlc ? '免費 DLC 領取' : '免費遊戲領取', icon_url: opts.steamIcon };
    const plats = g.platforms ? parsePlatforms(g.platforms).slice(0, 3).join('、') : '';
    if (plats) lines.push(`${chip('平台')} ${chip(plats)}`);
    if (g.worth_usd) lines.push(`${chip('價值')} ${chip(g.worth_usd)}`);
    if (end) lines.push(`${chip('領取截止')} ${deadlineMarkup(end)}`);
    if (isHttp(g.image)) embed.image = { url: g.image };
    embed.footer = { text: '資料來源:GamerPower' };
  }

  embed.description = clamp(lines.join('\n'), MAX_DESC);
  return {
    content: resolveContent(opts.mentionText, opts.mention),
    embeds: [embed],
    components: isHttp(g.url) ? linkButton('前往領取', g.url) : undefined,
  };
}

export interface DropInput {
  discordId: string; name: string; appid: number; lowCents: number; reason: 'drop' | 'target';
  regularCents?: number | null; review?: ReviewSummary | null; headerImage?: string | null;
  mentionText?: string;  // 有給(含 '')時覆蓋預設 @discordId;''=不提及
}

// 降價/目標價 embed。預設 @ 使用者(content 提及);guild 路由可用 mentionText 改成 @身分組或不提及。
export function buildDropEmbed(p: DropInput): MessagePayload {
  const storeUrl = `https://store.steampowered.com/app/${p.appid}/`;
  const isTarget = p.reason === 'target';
  const lines: string[] = [`${chip('現價')} ${chip(formatTwd(p.lowCents))}`];

  if (p.regularCents && p.regularCents > p.lowCents) {
    const dp = Math.round((1 - p.lowCents / p.regularCents) * 100);
    lines.push(`${chip('原價')} ~~${formatTwd(p.regularCents)}~~ · -${dp}%`);
  }
  lines.push(isTarget ? `${chip('狀態')} ${chip('已跌破你的目標價')}` : `${chip('史低')} ${chip('★ 本站新低')}`);
  const rc = reviewChip(p.review);
  if (rc) lines.push(`${chip('整體評價')} ${rc}`);

  const embed: DiscordEmbed = {
    color: isTarget ? COLORS.target : COLORS.drop,
    author: { name: isTarget ? '🎯 跌破目標價' : '📉 史低降價快訊' },
    title: clamp(`《${p.name}》`, MAX_TITLE),
    url: storeUrl,
    description: clamp(lines.join('\n'), MAX_DESC),
    footer: { text: '資料來源:Steam Store' },
  };
  // 大圖封面(embed.image,全寬)以與免費/digest 通知版面一致(原本用 thumbnail 小縮圖)。
  if (isHttp(p.headerImage)) embed.image = { url: p.headerImage };

  return { content: resolveContent(p.mentionText, p.discordId), embeds: [embed], components: linkButton('前往商店', storeUrl) };
}

export interface DigestOpts { mention?: string; mentionText?: string; siteUrl?: string; steamIcon?: string; }

// 特價精選 digest embed;依折扣高→低取 topN;空回 null。
export function buildDigestEmbed(deals: Deal[], topN: number, opts: DigestOpts = {}): MessagePayload | null {
  const top = [...deals].sort((a, b) => b.discountPercent - a.discountPercent).slice(0, topN);
  if (top.length === 0) return null;
  const site = opts.siteUrl ?? SITE_URL;
  const lines = top.map((d, i) => {
    const name = `[${d.nameZh}](https://store.steampowered.com/app/${d.appid}/)`;
    return `**${i + 1}.** ${name} ${chip(`-${d.discountPercent}%`)} ${chip(formatTwd(d.priceCents))}`;
  });
  const embed: DiscordEmbed = {
    color: COLORS.digest,
    author: { name: 'STEAM 特價精選', icon_url: opts.steamIcon },
    title: `Top ${top.length} 特價`,
    description: clamp(lines.join('\n'), MAX_DESC),
    footer: { text: '資料來源:Steam Store', icon_url: opts.steamIcon },
  };
  if (isHttp(top[0].headerImage)) embed.image = { url: top[0].headerImage };

  return { content: resolveContent(opts.mentionText, opts.mention), embeds: [embed], components: linkButton('看更多特價', site) };
}

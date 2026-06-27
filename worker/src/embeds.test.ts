import { describe, it, expect } from 'vitest';
import {
  chip, deadlineMarkup, parseEndDate, priceLine, COLORS,
  buildGiveawayEmbed, buildDropEmbed, buildDigestEmbed,
} from './embeds';
import type { Deal } from '@ssc/shared';

describe('helpers', () => {
  it('chip 以 inline code 包字串', () => {
    expect(chip('折扣')).toBe('`折扣`');
  });
  it('chip 去掉反引號與換行,避免外部字串破出 inline code', () => {
    expect(chip('a`b')).toBe("`a'b`");
    expect(chip('x\ny')).toBe('`x y`');
  });
  it('parseEndDate 解析 GamerPower 日期時間為 unix 秒(視為 UTC)', () => {
    expect(parseEndDate('2026-06-19 01:00:00')).toBe(Math.floor(Date.UTC(2026, 5, 19, 1, 0, 0) / 1000));
  });
  it('parseEndDate 解析 ISO 日期時間(無時區視為 UTC,結果不隨機器時區改變)', () => {
    expect(parseEndDate('2026-07-01T00:00:00')).toBe(Math.floor(Date.UTC(2026, 6, 1, 0, 0, 0) / 1000));
  });
  it('parseEndDate 對 N/A / null / 亂字串回 null', () => {
    expect(parseEndDate('N/A')).toBeNull();
    expect(parseEndDate(null)).toBeNull();
    expect(parseEndDate('not a date')).toBeNull();
  });
  it('parseEndDate 對超出範圍的月/日/時回 null(不靜默 rollover)', () => {
    expect(parseEndDate('2026-13-01 00:00:00')).toBeNull();
    expect(parseEndDate('2026-01-45 00:00:00')).toBeNull();
    expect(parseEndDate('2026-01-01 99:00:00')).toBeNull();
  });
  it('deadlineMarkup 組 Discord 絕對+相對時間戳', () => {
    expect(deadlineMarkup(1750000000)).toBe('<t:1750000000:F>（<t:1750000000:R>）');
  });
  it('priceLine:特價為 0 時顯示刪線原價 → 免費', () => {
    const s = priceLine(21600, 0);
    expect(s).toContain('~~NT$ 216~~');
    expect(s).toContain('免費');
  });
  it('priceLine:有折扣時顯示刪線原價 → 特價', () => {
    const s = priceLine(99000, 49300);
    expect(s).toContain('~~NT$ 990~~');
    expect(s).toContain('NT$ 493');
  });
});

describe('buildGiveawayEmbed(完整版)', () => {
  const g = {
    title: 'The Red Lantern', url: 'https://store.steampowered.com/app/871550/', type: 'game',
    platforms: 'Steam', end_date: '2026-06-19 01:00:00', worth_usd: '$14.99', image: null,
  };
  const enrich = {
    appid: 871550, headerImage: 'https://cdn/h.jpg', regularCents: 21600,
    review: { scoreDesc: '極度好評', positivePct: 84, total: 1000 },
  };
  const p = buildGiveawayEmbed(g, enrich, { mention: '42', steamIcon: 'https://icon.png' });

  it('content 內 @ 提及使用者(個人版)', () => expect(p.content).toBe('<@42>'));
  it('用免費色', () => expect(p.embeds![0].color).toBe(COLORS.free));
  it('author 標示 Steam 免費遊戲且帶 icon', () => {
    expect(p.embeds![0].author!.name).toContain('免費遊戲');
    expect(p.embeds![0].author!.icon_url).toBe('https://icon.png');
  });
  it('title 連到領取連結', () => {
    expect(p.embeds![0].title).toBe('The Red Lantern');
    expect(p.embeds![0].url).toBe(g.url);
  });
  it('description 含折扣/價格/領取截止/評價', () => {
    const d = p.embeds![0].description!;
    expect(d).toContain('`折扣`');
    expect(d).toContain('-100%');
    expect(d).toContain('~~NT$ 216~~');
    expect(d).toContain('免費');
    expect(d).toContain('<t:'); // 領取截止時間戳
    expect(d).toContain('極度好評');
    expect(d).toContain('84%');
  });
  it('image 用 Steam 封面', () => expect(p.embeds![0].image!.url).toBe('https://cdn/h.jpg'));
  it('一律框成「免費領取」(即使 Steam 現價非 0)', () => {
    const p2 = buildGiveawayEmbed(g, { appid: 1, headerImage: 'https://cdn/x.jpg', regularCents: 29900, review: null }, {});
    const d = p2.embeds![0].description!;
    expect(d).toContain('-100%');
    expect(d).toContain('~~NT$ 299~~');
    expect(d).toContain('免費');
  });
  it('enrich 封面非 http 時不設 image(與其他分支一致)', () => {
    const p2 = buildGiveawayEmbed(g, { appid: 1, headerImage: '', regularCents: 21600, review: null }, {});
    expect(p2.embeds![0].image).toBeUndefined();
  });
  it('過長標題截斷到 256 字', () => {
    const p2 = buildGiveawayEmbed({ ...g, title: 'X'.repeat(300) }, null, {});
    expect(p2.embeds![0].title!.length).toBe(256);
    expect(p2.embeds![0].title!.endsWith('…')).toBe(true);
  });
  it('footer 標 Steam Store', () => expect(p.embeds![0].footer!.text).toContain('Steam Store'));
  it('加上前往領取 link button', () => {
    const btn = p.components![0].components[0];
    expect(btn.style).toBe(5);
    expect(btn.url).toBe(g.url);
    expect(btn.label).toContain('領取');
  });
});

describe('buildGiveawayEmbed(精簡版)', () => {
  const g = {
    title: 'Epic Freebie', url: 'https://epic/claim', type: 'game', platforms: 'Epic Games Store',
    end_date: '2026-07-03 23:00:00', worth_usd: '$19.99', image: 'https://gp/img.jpg',
  };
  const p = buildGiveawayEmbed(g, null, {});

  it('非個人版時 content 無提及', () => expect(p.content).toBeUndefined());
  it('mentionText 覆蓋(身分組/不提及)', () => {
    expect(buildGiveawayEmbed(g, null, { mentionText: '<@&r1>' }).content).toBe('<@&r1>');
    expect(buildGiveawayEmbed(g, null, { mention: '42', mentionText: '' }).content).toBeUndefined();
  });
  it('footer 標 GamerPower 而非 Steam', () => expect(p.embeds![0].footer!.text).toContain('GamerPower'));
  it('image 用 GamerPower 圖', () => expect(p.embeds![0].image!.url).toBe('https://gp/img.jpg'));
  it('description 含平台與價值', () => {
    const d = p.embeds![0].description!;
    expect(d).toContain('Epic Games Store');
    expect(d).toContain('$19.99');
  });
  it('仍有領取按鈕', () => expect(p.components![0].components[0].url).toBe('https://epic/claim'));
  it('url 非 http 時略過 title url 與按鈕', () => {
    const np = buildGiveawayEmbed({ ...g, url: 'steam://run/1' }, null, {});
    expect(np.embeds![0].url).toBeUndefined();
    expect(np.components).toBeUndefined();
  });
});

describe('buildDropEmbed', () => {
  const base = {
    discordId: '7', name: 'Hades II', appid: 1145350, lowCents: 49300, regularCents: 99000,
    review: { scoreDesc: '壓倒性好評', positivePct: 97, total: 5000 }, headerImage: 'https://cdn/h.jpg',
  };
  it('drop:紅色、本站新低標示、會 @ 使用者、大圖封面(與免費/digest 一致)、商店按鈕', () => {
    const p = buildDropEmbed({ ...base, reason: 'drop' });
    expect(p.content).toBe('<@7>');
    expect(p.embeds![0].color).toBe(COLORS.drop);
    expect(p.embeds![0].description).toContain('新低');
    expect(p.embeds![0].title).toContain('《Hades II》');
    expect(p.embeds![0].url).toContain('/app/1145350/');
    expect(p.embeds![0].image!.url).toBe('https://cdn/h.jpg');
    expect(p.embeds![0].thumbnail).toBeUndefined();
    expect(p.components![0].components[0].url).toContain('/app/1145350/');
  });
  it('target:綠色', () => {
    expect(buildDropEmbed({ ...base, reason: 'target' }).embeds![0].color).toBe(COLORS.target);
  });
  it('顯示現價、刪線原價、評價', () => {
    const d = buildDropEmbed({ ...base, reason: 'drop' }).embeds![0].description!;
    expect(d).toContain('NT$ 493');
    expect(d).toContain('~~NT$ 990~~');
    expect(d).toContain('壓倒性好評');
  });
  it('缺選配補強(無原價/評價/封面)也能組', () => {
    const p = buildDropEmbed({ discordId: '7', name: 'G', appid: 2, lowCents: 100, reason: 'drop' });
    expect(p.embeds![0].description).toContain('NT$ 1');
    expect(p.embeds![0].image).toBeUndefined();
  });
  it('mentionText 有給時覆蓋預設 @我:身分組', () => {
    expect(buildDropEmbed({ ...base, reason: 'drop', mentionText: '<@&r9>' }).content).toBe('<@&r9>');
  });
  it('mentionText 為空字串 → 不提及(content undefined)', () => {
    expect(buildDropEmbed({ ...base, reason: 'drop', mentionText: '' }).content).toBeUndefined();
  });
  it('未給 mentionText 時維持舊行為 @discordId', () => {
    expect(buildDropEmbed({ ...base, reason: 'drop' }).content).toBe('<@7>');
  });
});

describe('buildDigestEmbed', () => {
  const mk = (appid: number, nameZh: string, discountPercent: number, priceCents: number, headerImage: string, genres?: string[]): Deal => ({
    appid, nameZh, headerImage, priceCents, regularCents: priceCents * 2, discountPercent, rank: appid,
    observedLowCents: null, observedLowAt: null, isAtObservedLow: false, observedMaxDiscount: discountPercent, genres,
  });
  const deals = [mk(1, 'AAA', 40, 30000, 'https://cdn/a.jpg', ['動作']), mk(2, 'BBB', 90, 10000, 'https://cdn/b.jpg', ['策略'])];

  it('空陣列回 null', () => expect(buildDigestEmbed([], 5)).toBeNull());
  it('依類型分區成 embed fields(不再用單一 description)', () => {
    const e = buildDigestEmbed(deals, 5)!.embeds![0];
    expect(e.description).toBeUndefined();
    expect(e.fields!.map(f => f.name)).toEqual(expect.arrayContaining(['動作', '策略']));
  });
  it('類型依其最高折扣排序(最熱在前);組內含該類型遊戲', () => {
    const e = buildDigestEmbed(deals, 5)!.embeds![0];
    expect(e.fields![0].name).toBe('策略'); // 90% 那組排前
    expect(e.fields![0].value).toContain('BBB');
    expect(e.fields!.find(f => f.name === '動作')!.value).toContain('AAA');
  });
  it('無類型者歸「其他」', () => {
    const e = buildDigestEmbed([mk(3, 'CCC', 50, 5000, 'https://cdn/c.jpg')], 5)!.embeds![0];
    expect(e.fields!.map(f => f.name)).toEqual(['其他']);
    expect(e.fields![0].value).toContain('CCC');
  });
  it('同類型多款組內依折扣高→低', () => {
    const e = buildDigestEmbed([mk(1, 'LO', 30, 1000, 'i', ['動作']), mk(2, 'HI', 80, 1000, 'i', ['動作'])], 5)!.embeds![0];
    const v = e.fields![0].value;
    expect(v.indexOf('HI')).toBeLessThan(v.indexOf('LO'));
  });
  it('限制 topN 筆(跨所有分區合計)', () => {
    const many = Array.from({ length: 8 }, (_, i) => mk(i, 'G' + i, 10 + i, 1000, 'i', ['動作']));
    const e = buildDigestEmbed(many, 3)!.embeds![0];
    const total = e.fields!.reduce((n, f) => n + (f.value.match(/G\d/g)?.length ?? 0), 0);
    expect(total).toBe(3);
  });
  it('金色、榜首封面、看更多按鈕連到站點', () => {
    const p = buildDigestEmbed(deals, 5)!;
    expect(p.embeds![0].color).toBe(COLORS.digest);
    expect(p.embeds![0].image!.url).toBe('https://cdn/b.jpg'); // 90% 為榜首
    expect(p.components![0].components[0].url).toBe('https://steam.terrychou.com/');
  });
  it('個人版可帶 @ 提及', () => {
    expect(buildDigestEmbed(deals, 5, { mention: '9' })!.content).toBe('<@9>');
  });
  it('mentionText 覆蓋(身分組/不提及)', () => {
    expect(buildDigestEmbed(deals, 5, { mentionText: '<@&r1>' })!.content).toBe('<@&r1>');
    expect(buildDigestEmbed(deals, 5, { mentionText: '' })!.content).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { formatNotifyMessage, formatGiveawayMessage, formatDigest } from './discord-bot';

describe('formatNotifyMessage', () => {
  it('含 mention、書名號名稱、台幣、商店連結', () => {
    const m = formatNotifyMessage({ discordId: '12345', name: 'Hades II', lowCents: 49300, appid: 1145350 });
    expect(m).toContain('<@12345>');
    expect(m).toContain('《Hades II》');
    expect(m).toContain('NT$ 493');
    expect(m).toContain('https://store.steampowered.com/app/1145350/');
  });
  it('預設(drop)用「創新低」措辭', () => {
    expect(formatNotifyMessage({ discordId: '1', name: 'G', lowCents: 100, appid: 2 })).toContain('創新低');
  });
  it('reason=target 用「目標價」措辭', () => {
    const m = formatNotifyMessage({ discordId: '1', name: 'G', lowCents: 100, appid: 2, reason: 'target' });
    expect(m).toContain('目標價');
    expect(m).not.toContain('創新低');
  });
});

describe('formatGiveawayMessage', () => {
  it('含標題、平台、價值、領取連結', () => {
    const m = formatGiveawayMessage({ title: 'Cool Game', url: 'https://x/g/1', type: 'game', platforms: 'Steam,Epic Games Store', end_date: '2026-07-01T00:00:00', worth_usd: '$9.99' });
    expect(m).toContain('Cool Game');
    expect(m).toContain('https://x/g/1');
    expect(m).toContain('Steam');
    expect(m).toContain('$9.99');
    expect(m).toContain('2026-07-01');
  });
  it('DLC 類型有標示;缺平台/期限/價值不報錯', () => {
    const m = formatGiveawayMessage({ title: 'X', url: 'u', type: 'dlc', platforms: '', end_date: null, worth_usd: null });
    expect(m).toContain('DLC');
    expect(m).toContain('X');
  });
});

describe('formatDigest', () => {
  it('依折扣排序取 TopN、含名稱與台幣', () => {
    const m = formatDigest([
      { nameZh: 'AAA', discountPercent: 40, priceCents: 30000, appid: 1 },
      { nameZh: 'BBB', discountPercent: 90, priceCents: 10000, appid: 2 },
    ], 5)!;
    expect(m.indexOf('BBB')).toBeLessThan(m.indexOf('AAA')); // 90% 在 40% 前
    expect(m).toContain('NT$ 100');
    expect(m).toContain('90%');
  });
  it('限制 TopN 筆數', () => {
    const deals = Array.from({ length: 8 }, (_, i) => ({ nameZh: 'G' + i, discountPercent: 10 + i, priceCents: 1000, appid: i }));
    const m = formatDigest(deals, 3)!;
    expect(m.match(/G\d/g)?.length).toBe(3);
  });
  it('空陣列回 null', () => expect(formatDigest([], 5)).toBeNull());
});

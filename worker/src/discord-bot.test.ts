import { describe, it, expect } from 'vitest';
import { formatNotifyMessage } from './discord-bot';

describe('formatNotifyMessage', () => {
  it('含 mention、書名號名稱、台幣、商店連結', () => {
    const m = formatNotifyMessage({ discordId: '12345', name: 'Hades II', lowCents: 49300, appid: 1145350 });
    expect(m).toContain('<@12345>');
    expect(m).toContain('《Hades II》');
    expect(m).toContain('NT$ 493');
    expect(m).toContain('https://store.steampowered.com/app/1145350/');
  });
});

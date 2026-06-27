import { describe, it, expect } from 'vitest';
import { parsePlatforms, toFreeGiveaway, keepForeverGame, isSteamGiveaway, RawGiveaway } from './gamerpower-parse';
const perpetual: RawGiveaway = {
  id: 2840, title: 'Fallout 76', worth: '$39.99', image: 'http://img/f76.jpg', thumbnail: '',
  open_giveaway_url: 'http://gp/2840', type: 'Game', platforms: 'PC, Epic Games Store',
  end_date: 'N/A', status: 'Active',
};
const dlc: RawGiveaway = { ...perpetual, id: 999, type: 'DLC', end_date: '2026-07-01 23:59:59' };
const beta: RawGiveaway = { ...perpetual, id: 12, type: 'Beta' };
describe('gamerpower-parse', () => {
  it('platforms 逗號字串切成陣列', () => {
    expect(parsePlatforms('PC, Steam, Epic Games Store')).toEqual(['PC', 'Steam', 'Epic Games Store']);
  });
  it('toFreeGiveaway 正規化、N/A 期限轉 null', () => {
    expect(toFreeGiveaway(perpetual)).toEqual({
      id: '2840', source: 'gamerpower', title: 'Fallout 76', worthUsd: '$39.99',
      image: 'http://img/f76.jpg', platforms: ['PC', 'Epic Games Store'],
      endDate: null, url: 'http://gp/2840', type: 'Game',
    });
  });
  it('有期限的領取 endDate 保留', () => {
    expect(toFreeGiveaway(dlc).endDate).toBe('2026-07-01 23:59:59');
  });
  it('isSteamGiveaway:平台含 Steam 才算', () => {
    expect(isSteamGiveaway('PC, Steam, Epic Games Store')).toBe(true);
    expect(isSteamGiveaway('Steam')).toBe(true);
    expect(isSteamGiveaway('Epic Games Store, GOG')).toBe(false);
    expect(isSteamGiveaway('')).toBe(false);
  });
  it('keepForeverGame:收 Game/DLC 且 Active(含非 Steam 平台;排除 Beta 與非 Active)', () => {
    expect(keepForeverGame({ ...perpetual, platforms: 'PC, Steam' })).toBe(true);
    expect(keepForeverGame({ ...dlc, platforms: 'Steam' })).toBe(true);
    expect(keepForeverGame(perpetual)).toBe(true); // Epic-only 的 Game/Active 也收(多平台)
    expect(keepForeverGame({ ...perpetual, platforms: 'GOG' })).toBe(true); // GOG 也收
    expect(keepForeverGame({ ...beta, platforms: 'Steam' })).toBe(false); // Beta 排除
    expect(keepForeverGame({ ...perpetual, status: 'Expired' })).toBe(false); // 非 Active 排除
  });
});

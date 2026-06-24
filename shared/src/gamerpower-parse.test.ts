import { describe, it, expect } from 'vitest';
import { parsePlatforms, toFreeGiveaway, keepForeverGame, RawGiveaway } from './gamerpower-parse';
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
  it('keepForeverGame:只收 Game/DLC 且 Active,排除 Beta', () => {
    expect(keepForeverGame(perpetual)).toBe(true);
    expect(keepForeverGame(dlc)).toBe(true);
    expect(keepForeverGame(beta)).toBe(false);
  });
});

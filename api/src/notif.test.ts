import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { ensureAuthTables, getNotifPrefs, putNotifPrefs } from './db';

function freshDb() { const db = new Database(':memory:'); ensureAuthTables(db); return db; }

describe('notif prefs data layer', () => {
  it('無列回預設', () => {
    const db = freshDb();
    expect(getNotifPrefs(db, 1)).toEqual({ dropEnabled: true, freeEnabled: false, digestHours: 0, delivery: 'channel', genres: [] });
  });
  it('put 部分欄位合併、再讀回', () => {
    const db = freshDb();
    putNotifPrefs(db, 1, { freeEnabled: true, digestHours: 24 }, 1000);
    expect(getNotifPrefs(db, 1)).toMatchObject({ dropEnabled: true, freeEnabled: true, digestHours: 24, delivery: 'channel' });
    putNotifPrefs(db, 1, { delivery: 'dm', dropEnabled: false }, 2000);
    expect(getNotifPrefs(db, 1)).toMatchObject({ dropEnabled: false, freeEnabled: true, digestHours: 24, delivery: 'dm' });
  });
  it('genres 全量取代(空清除)', () => {
    const db = freshDb();
    putNotifPrefs(db, 1, { genres: ['動作', 'RPG'] }, 1000);
    expect(getNotifPrefs(db, 1).genres.slice().sort()).toEqual(['動作', 'RPG'].sort());
    putNotifPrefs(db, 1, { genres: ['策略'] }, 2000);
    expect(getNotifPrefs(db, 1).genres).toEqual(['策略']);
    putNotifPrefs(db, 1, { genres: [] }, 3000);
    expect(getNotifPrefs(db, 1).genres).toEqual([]);
  });
  it('未提供 genres 時不動既有 genres', () => {
    const db = freshDb();
    putNotifPrefs(db, 1, { genres: ['動作'] }, 1000);
    putNotifPrefs(db, 1, { digestHours: 168 }, 2000);
    expect(getNotifPrefs(db, 1).genres).toEqual(['動作']);
  });
  it('prefs 為 per-user', () => {
    const db = freshDb();
    putNotifPrefs(db, 1, { delivery: 'dm' }, 1000);
    expect(getNotifPrefs(db, 2).delivery).toBe('channel');
  });
});

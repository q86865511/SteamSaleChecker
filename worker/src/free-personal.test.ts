import { describe, it, expect, vi, afterEach } from 'vitest';
import { openDb, markFreeSent, freeAlreadySent } from './db';
import { collectAndSendPersonalFree } from './free-personal';
import type { FreeGiveaway } from '@ssc/shared';

const mkFree = (id: string, platforms = 'Steam'): FreeGiveaway =>
  ({ id, source: 'gamerpower', title: 'G' + id, image: '', platforms: platforms.split(','), endDate: null, url: 'u' + id, type: 'game' });

afterEach(() => { vi.unstubAllGlobals(); });
function okFetch() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204 })));
  // 節流 sleep 即時化,避免測試等真實 1200ms
  vi.stubGlobal('setTimeout', (fn: () => void) => { fn(); return 0 as unknown as NodeJS.Timeout; });
}

function userFree(db: ReturnType<typeof openDb>, id: number, delivery = 'channel') {
  db.prepare('INSERT INTO users(id,discord_id,username) VALUES(?,?,?)').run(id, 'd' + id, 'U' + id);
  db.prepare('INSERT INTO notif_prefs(user_id,free_enabled,delivery) VALUES(?,1,?)').run(id, delivery);
}

describe('collectAndSendPersonalFree', () => {
  it('首次見到使用者建立基線(不通知),之後僅新出現者通知', async () => {
    const db = openDb(':memory:'); userFree(db, 1); okFetch();
    let sent = await collectAndSendPersonalFree(db, [mkFree('g1'), mkFree('g2')], 'tok', 'ch', 1000);
    expect(sent).toBe(0); // 基線、不轟炸
    expect(freeAlreadySent(db, 1, 'g1')).toBe(true);
    sent = await collectAndSendPersonalFree(db, [mkFree('g1'), mkFree('g2'), mkFree('g3')], 'tok', 'ch', 2000);
    expect(sent).toBe(1); // 只有 g3 是新的
    expect(freeAlreadySent(db, 1, 'g3')).toBe(true);
  });
  it('非 Steam 不送', async () => {
    const db = openDb(':memory:'); userFree(db, 1); markFreeSent(db, 1, 'seed', 1); okFetch();
    const sent = await collectAndSendPersonalFree(db, [mkFree('e1', 'Epic Games Store')], 'tok', 'ch', 2000);
    expect(sent).toBe(0);
  });
  it('達上限者下輪續發(不永久遺失)', async () => {
    const db = openDb(':memory:'); userFree(db, 1); markFreeSent(db, 1, 'seed', 1); okFetch(); // 已過基線
    const many = Array.from({ length: 10 }, (_, i) => mkFree('n' + i));
    expect(await collectAndSendPersonalFree(db, many, 'tok', 'ch', 1000)).toBe(8); // cap
    expect(await collectAndSendPersonalFree(db, many, 'tok', 'ch', 2000)).toBe(2); // 其餘續發
  });
});

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { openDb } from './db';
import { runPipeline } from './pipeline';
import { collectPending, dispatchNotifications } from './notify';
import { syncAndNotifyGiveaways } from './giveaways';
import { maybeSendDigest } from './digest';
import { writeJsonAtomic } from './bake';
import { shouldRefresh, lastSeededAt, seedItadLows } from './seed/itad';
import type { Meta } from '@ssc/shared';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
loadEnv({ path: join(REPO_ROOT, 'api', '.env') });
const envOr = (v: string | undefined, fallback: string): string => (v && v.length > 0 ? v : fallback);
const DATA_DIR = envOr(process.env.SSC_DATA_DIR, join(REPO_ROOT, 'web', 'public', 'data'));
const DB_PATH = envOr(process.env.SSC_DB, join(REPO_ROOT, 'data', 'steam.db'));
const DEAL_LIMIT = Number(envOr(process.env.SSC_DEAL_LIMIT, '120')) || 120;

const main = async () => {
  const now = Math.floor(Date.now() / 1000);
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(join(REPO_ROOT, 'data'), { recursive: true });
  const db = openDb(DB_PATH);
  const metaPath = join(DATA_DIR, 'meta.json');
  let trackingSince = now;
  if (existsSync(metaPath)) {
    try { trackingSince = (JSON.parse(readFileSync(metaPath, 'utf8')) as Meta).trackingSince ?? now; } catch {}
  }
  try {
    const { deals, free, meta, newLows } = await runPipeline(db, DATA_DIR, now, trackingSince, DEAL_LIMIT);
    console.log(`OK deals=${meta.dealCount} free=${meta.freeCount}`);
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const channelId = process.env.DISCORD_NOTIFY_CHANNEL_ID;
    if (botToken && channelId) {
      const pending = collectPending(db, newLows);
      const sent = await dispatchNotifications(db, pending, botToken, channelId, now);
      console.log(`通知:${sent}/${pending.length} 已送`);
      // 免費領取通知 + 每日/每週摘要(失敗不影響主流程)
      try {
        const gsent = await syncAndNotifyGiveaways(db, free, botToken, channelId, now);
        if (gsent) console.log(`免費領取通知:${gsent} 筆`);
        const digestHours = Number(envOr(process.env.SSC_DIGEST_HOURS, '0'));
        const digestSec = (Number.isFinite(digestHours) ? digestHours : 0) * 3600;
        if (digestSec > 0 && await maybeSendDigest(db, deals, botToken, channelId, now, digestSec)) {
          console.log('特價摘要:已送出');
        }
      } catch (e) {
        console.warn('免費/摘要通知失敗(不影響主流程):', e instanceof Error ? e.message : e);
      }
    } else {
      console.log('未設定 DISCORD_BOT_TOKEN/CHANNEL,略過通知');
    }
    // ITAD 每日刷新史低(常駐 worker;有 key 才跑、每 SSC_ITAD_REFRESH_HOURS 一次;
    // 失敗不影響主流程;效果於下一輪重烤反映)。
    const itadKey = process.env.ITAD_API_KEY;
    if (itadKey) {
      const last = lastSeededAt(db);
      // honor 顯式 0(每輪都刷);空字串/NaN 才回退 24。不可用 `|| 24`(0 為 falsy)。
      const refreshHours = Number(envOr(process.env.SSC_ITAD_REFRESH_HOURS, '24'));
      const refreshSec = (Number.isFinite(refreshHours) ? refreshHours : 24) * 3600;
      if (shouldRefresh(last, now, refreshSec)) {
        console.log('ITAD 每日刷新:開始');
        try {
          await seedItadLows(db, { key: itadKey, log: (m) => console.log('  ' + m) });
        } catch (e) {
          console.warn('ITAD 刷新失敗(不影響主流程):', e instanceof Error ? e.message : e);
        }
      } else {
        const hrs = last ? ((now - last) / 3600).toFixed(1) : '?';
        console.log(`ITAD 每日刷新:跳過(上次 ${hrs}h 前)`);
      }
    } else {
      console.log('未設定 ITAD_API_KEY,略過 ITAD 刷新');
    }
  } catch (e) {
    console.error('pipeline 失敗,保留上次資料:', e);
    if (existsSync(metaPath)) {
      const old = JSON.parse(readFileSync(metaPath, 'utf8')) as Meta;
      writeJsonAtomic(metaPath, { ...old, ok: false });
    }
    process.exit(1);
  }
};
main();

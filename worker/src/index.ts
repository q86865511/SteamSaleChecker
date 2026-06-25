import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { openDb } from './db';
import { runPipeline } from './pipeline';
import { collectPending, dispatchNotifications } from './notify';
import { writeJsonAtomic } from './bake';
import type { Meta } from '@ssc/shared';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
loadEnv({ path: join(REPO_ROOT, 'api', '.env') });
const DATA_DIR = process.env.SSC_DATA_DIR ?? join(REPO_ROOT, 'web', 'public', 'data');
const DB_PATH = process.env.SSC_DB ?? join(REPO_ROOT, 'data', 'steam.db');
const DEAL_LIMIT = Number(process.env.SSC_DEAL_LIMIT ?? '120');

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
    const { meta, newLows } = await runPipeline(db, DATA_DIR, now, trackingSince, DEAL_LIMIT);
    console.log(`OK deals=${meta.dealCount} free=${meta.freeCount}`);
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const channelId = process.env.DISCORD_NOTIFY_CHANNEL_ID;
    if (botToken && channelId) {
      const pending = collectPending(db, newLows);
      const sent = await dispatchNotifications(db, pending, botToken, channelId, now);
      console.log(`通知:${sent}/${pending.length} 已送`);
    } else {
      console.log('未設定 DISCORD_BOT_TOKEN/CHANNEL,略過通知');
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

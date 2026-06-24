import { join } from 'node:path';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { openDb } from './db';
import { runPipeline } from './pipeline';
import { writeJsonAtomic } from './bake';
import type { Meta } from '@ssc/shared';

const DATA_DIR = process.env.SSC_DATA_DIR ?? join(process.cwd(), 'web', 'public', 'data');
const DB_PATH = process.env.SSC_DB ?? join(process.cwd(), 'data', 'steam.db');
const DEAL_LIMIT = Number(process.env.SSC_DEAL_LIMIT ?? '120');

const main = async () => {
  const now = Math.floor(Date.now() / 1000);
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(join(process.cwd(), 'data'), { recursive: true });
  const db = openDb(DB_PATH);
  const metaPath = join(DATA_DIR, 'meta.json');
  let trackingSince = now;
  if (existsSync(metaPath)) {
    try { trackingSince = (JSON.parse(readFileSync(metaPath, 'utf8')) as Meta).trackingSince ?? now; } catch {}
  }
  try {
    const { meta } = await runPipeline(db, DATA_DIR, now, trackingSince, DEAL_LIMIT);
    console.log(`OK deals=${meta.dealCount} free=${meta.freeCount}`);
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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { openDb } from '../db';
import { seedItadLows } from './itad';

// seed 比 index.ts 深一層(worker/src/seed),故往上三層才是 repo 根。
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
loadEnv({ path: join(REPO_ROOT, 'api', '.env') });

const KEY = process.env.ITAD_API_KEY;
const DB_PATH = process.env.SSC_DB && process.env.SSC_DB.length > 0
  ? process.env.SSC_DB
  : join(REPO_ROOT, 'data', 'steam.db');
const CHECK_ONLY = process.argv.includes('--check'); // 只查不寫,驗證 country=TW 回台幣

const main = async () => {
  if (!KEY) { console.error('需要 ITAD_API_KEY(寫進 api/.env 或設環境變數)'); process.exit(1); }
  const db = openDb(DB_PATH);
  console.log(`seed${CHECK_ONLY ? '(--check 只查不寫)' : ''}`);
  const res = await seedItadLows(db, { key: KEY, checkOnly: CHECK_ONLY });
  if (res.appids === 0) {
    console.error('game_stats 為空 —— 請先跑 `npm -w @ssc/worker run run` 填充再 seed');
    process.exit(1);
  }
  console.log(CHECK_ONLY ? 'seed --check 結束' : 'seed 完成');
};
main().catch(e => { console.error(e); process.exit(1); });

import type { DB } from './db';
import { lastReportSent, recordReportSent } from './db';
import { shouldRefresh } from './seed/itad';
import { formatDigest, postChannelMessage } from './discord-bot';
import type { Deal } from '@ssc/shared';

// 每日/每週特價摘要(gated)。intervalSec<=0 視為停用。回傳是否送出。
// 空榜時仍推進 gate(避免每輪重試);發送失敗時不推進 gate(下輪重試)。
export async function maybeSendDigest(
  db: DB, deals: Deal[], botToken: string, channelId: string, now: number, intervalSec: number, topN = 5,
): Promise<boolean> {
  if (intervalSec <= 0) return false;
  if (!shouldRefresh(lastReportSent(db, 'digest'), now, intervalSec)) return false;
  const msg = formatDigest(deals, topN);
  if (!msg) { recordReportSent(db, 'digest', now); return false; }
  await postChannelMessage(botToken, channelId, msg);
  recordReportSent(db, 'digest', now);
  return true;
}

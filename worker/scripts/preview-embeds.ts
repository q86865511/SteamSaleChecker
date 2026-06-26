import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { buildGiveawayEmbed, buildDropEmbed, buildDigestEmbed, type GiveawayEnrich, type MessagePayload } from '../src/embeds';
import { searchSteamAppid, fetchAppDetails, fetchReviewSummary } from '../src/sources/steam';
import { postChannelMessage } from '../src/discord-bot';
import type { Deal } from '@ssc/shared';

// 用法:tsx scripts/preview-embeds.ts ["免費遊戲標題"]
// 設了 DISCORD_BOT_TOKEN + SSC_PREVIEW_CHANNEL_ID(或 DISCORD_NOTIFY_CHANNEL_ID)就實際發到該頻道,
// 否則只印出 payload JSON。用來到 Discord 肉眼比對 4 種 embed 外觀。
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
loadEnv({ path: join(REPO_ROOT, 'api', '.env') });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const steamIcon = process.env.SSC_STEAM_ICON_URL || undefined;
const headerUrl = (appid: number) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;

const main = async () => {
  const title = process.argv[2] || 'The Red Lantern';

  // 1) 免費(完整版)— 實際解析 Steam appid 並補資料;失敗則用合成資料仍呈現完整版型
  const appid = await searchSteamAppid(title);
  let enrich: GiveawayEnrich | null = null;
  if (appid) {
    const app = await fetchAppDetails(appid);
    if (app) enrich = { appid, headerImage: app.headerImage, regularCents: app.regularCents, review: await fetchReviewSummary(appid) };
  }
  if (!enrich) {
    console.warn(`(對不到「${title}」的 Steam appid,改用合成資料示範完整版)`);
    enrich = { appid: 871550, headerImage: headerUrl(871550), regularCents: 21600, review: { scoreDesc: '極度好評', positivePct: 84, total: 1200 } };
  }
  const full = buildGiveawayEmbed(
    { title, url: `https://store.steampowered.com/app/${enrich.appid}/`, type: 'game', platforms: 'Steam', end_date: '2026-07-03 01:00:00', worth_usd: '$14.99', image: null },
    enrich, { steamIcon },
  );

  // 2) 免費(精簡版)— 非 Steam
  const simple = buildGiveawayEmbed(
    { title: 'Epic 本週限免遊戲', url: 'https://store.epicgames.com/', type: 'game', platforms: 'Epic Games Store', end_date: '2026-07-10 23:00:00', worth_usd: '$19.99', image: headerUrl(271590) },
    null, {},
  );

  // 3) 降價(用真實封面/評價,價格用示範折扣讓刪線可見)
  const dropAppid = 1145350;
  const dropApp = await fetchAppDetails(dropAppid);
  const drop = buildDropEmbed({
    discordId: '0', name: dropApp?.nameZh ?? 'Hades II', appid: dropAppid, lowCents: 49300, reason: 'drop',
    regularCents: 99000, headerImage: dropApp?.headerImage ?? headerUrl(dropAppid), review: await fetchReviewSummary(dropAppid),
  });

  // 4) digest
  const deal = (a: number, nameZh: string, dp: number, price: number): Deal => ({
    appid: a, nameZh, headerImage: headerUrl(a), priceCents: price, regularCents: price * 3, discountPercent: dp,
    rank: a, observedLowCents: null, observedLowAt: null, isAtObservedLow: false, observedMaxDiscount: dp,
  });
  const digest = buildDigestEmbed(
    [deal(1091500, 'Cyberpunk 2077', 80, 24600), deal(1145350, 'Hades II', 50, 49300), deal(1245620, 'Elden Ring', 40, 116400)], 5,
  );

  const payloads: Array<[string, MessagePayload | null]> = [
    ['免費(完整)', full], ['免費(精簡)', simple], ['降價', drop], ['digest', digest],
  ];
  const token = process.env.DISCORD_BOT_TOKEN;
  const channel = process.env.SSC_PREVIEW_CHANNEL_ID || process.env.DISCORD_NOTIFY_CHANNEL_ID;
  if (token && channel) {
    for (const [label, p] of payloads) {
      if (!p) continue;
      await postChannelMessage(token, channel, p, false); // 預覽不 ping
      console.log('已送', label);
      await sleep(1500);
    }
  } else {
    console.log('未設定 DISCORD_BOT_TOKEN/SSC_PREVIEW_CHANNEL_ID,改印出 payload JSON:');
    for (const [label, p] of payloads) console.log(`\n=== ${label} ===\n${JSON.stringify(p, null, 2)}`);
  }
};
main().catch(e => { console.error(e); process.exit(1); });

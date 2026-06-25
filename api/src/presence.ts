import { Client, GatewayIntentBits, ActivityType } from 'discord.js';

// Keeps a Gateway connection alive so the bot shows as online.
// discord.js handles heartbeat + auto-reconnect. Only non-privileged GUILDS intent is needed.
export function startPresence(token: string): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.once('clientReady', () => {
    console.log(`presence: bot 上線為 ${client.user?.tag}`);
    client.user?.setPresence({
      status: 'online',
      activities: [{ name: 'Steam 特價', type: ActivityType.Watching }],
    });
  });
  client.on('error', (e) => console.warn('presence error:', e instanceof Error ? e.message : e));
  void client.login(token).catch((e) => console.warn('presence login 失敗:', e instanceof Error ? e.message : e));
  return client;
}

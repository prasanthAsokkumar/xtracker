import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import {
  getTweetCount,
  getUser,
  getAllTrackingsWithStats,
  type TrackingWithStats,
} from './xtrackerClient';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TRACKED_HANDLE = process.env.TRACKED_HANDLE ?? 'elonmusk';

if (!TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is missing. Add it to .env');
}

const bot = new TelegramBot(TOKEN, { polling: true });

bot.onText(/^\/start$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `xtracker bot online.\nTracking: @${TRACKED_HANDLE}\n\nCommands:\n/latest - latest tweet count\n/count - total tweet count\n/user - full user info\n/help - show this message`
  );
});

bot.onText(/^\/help$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    'Commands:\n/latest - latest tweet count + active market stats\n/count - total tweet count for tracked user\n/markets - per-market tweet counts (active tracking periods)\n/user - full user info\n/count <handle> - count for a specific handle'
  );
});

function formatMarkets(trackings: TrackingWithStats[]): string {
  if (trackings.length === 0) return 'No active tracking periods.';
  const sorted = [...trackings].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );
  const lines = sorted.map((t) => {
    const start = t.startDate.slice(0, 10);
    const end = t.endDate.slice(0, 10);
    return `• ${t.title}\n   ${start} → ${end}\n   ${t.stats.total} posts (${t.stats.percentComplete}%)`;
  });
  return `Active markets for @${TRACKED_HANDLE}:\n\n${lines.join('\n\n')}`;
}

bot.onText(/^\/markets$/, async (msg) => {
  try {
    const trackings = await getAllTrackingsWithStats(TRACKED_HANDLE);
    bot.sendMessage(msg.chat.id, formatMarkets(trackings));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    bot.sendMessage(msg.chat.id, `Failed to fetch markets: ${message}`);
  }
});

bot.onText(/^\/count(?:\s+@?(\w+))?$/, async (msg, match) => {
  const handle = match?.[1] ?? TRACKED_HANDLE;
  try {
    const count = await getTweetCount(handle);
    bot.sendMessage(msg.chat.id, `@${handle} tweet count: ${count.toLocaleString()}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    bot.sendMessage(msg.chat.id, `Failed to fetch count for @${handle}: ${message}`);
  }
});

bot.onText(/^\/user$/, async (msg) => {
  try {
    const user = await getUser(TRACKED_HANDLE);
    bot.sendMessage(
      msg.chat.id,
      `Name: ${user.name}\nHandle: @${user.handle}\nPlatform: ${user.platform}\nVerified: ${user.verified}\nPosts: ${user._count.posts.toLocaleString()}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    bot.sendMessage(msg.chat.id, `Failed to fetch user: ${message}`);
  }
});

bot.onText(/^\/latest$/, async (msg) => {
  try {
    const [totalCount, trackings] = await Promise.all([
      getTweetCount(TRACKED_HANDLE),
      getAllTrackingsWithStats(TRACKED_HANDLE),
    ]);
    const marketLines = trackings
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      .map((t) => `• ${t.title}\n   ${t.stats.total} posts (${t.stats.percentComplete}%)`)
      .join('\n\n');
    const reply = `@${TRACKED_HANDLE} latest tweet count: ${totalCount.toLocaleString()}\n\n${marketLines || 'No active markets.'}`;
    bot.sendMessage(msg.chat.id, reply);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    bot.sendMessage(msg.chat.id, `Failed to fetch latest: ${message}`);
  }
});

bot.on('polling_error', (err) => {
  console.error('[polling_error]', err.message);
});

console.log(`xtracker bot started. Tracking @${TRACKED_HANDLE}`);

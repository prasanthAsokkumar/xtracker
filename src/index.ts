import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { getTweetCount, getUser } from './xtrackerClient';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TRACKED_HANDLE = process.env.TRACKED_HANDLE ?? 'elonmusk';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 2 * 60 * 1000);
const NOTIFY_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is missing. Add it to .env');
}

const bot = new TelegramBot(TOKEN, { polling: true });

bot.onText(/^\/start$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `xtracker bot online.\nTracking: @${TRACKED_HANDLE}\n\nCommands:\n/count - current tweet count\n/user - full user info\n/help - show this message`
  );
});

bot.onText(/^\/help$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    'Commands:\n/count - current tweet count for tracked user\n/user - full user info\n/count <handle> - count for a specific handle'
  );
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

bot.on('polling_error', (err) => {
  console.error('[polling_error]', err.message);
});

let lastKnownCount: number | null = null;

async function pollTweetCount(): Promise<void> {
  try {
    const count = await getTweetCount(TRACKED_HANDLE);
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] @${TRACKED_HANDLE} tweet count: ${count}`);

    if (lastKnownCount !== null && count !== lastKnownCount && NOTIFY_CHAT_ID) {
      const delta = count - lastKnownCount;
      const sign = delta > 0 ? '+' : '';
      await bot.sendMessage(
        NOTIFY_CHAT_ID,
        `@${TRACKED_HANDLE} tweet count updated: ${count.toLocaleString()} (${sign}${delta})`
      );
    }
    lastKnownCount = count;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[poll_error]', message);
  }
}

console.log(`xtracker bot started. Tracking @${TRACKED_HANDLE} every ${POLL_INTERVAL_MS / 1000}s`);
void pollTweetCount();
setInterval(pollTweetCount, POLL_INTERVAL_MS);

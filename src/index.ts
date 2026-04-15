import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { getTweetCount, getUser } from './xtrackerClient';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TRACKED_HANDLE = process.env.TRACKED_HANDLE ?? 'elonmusk';

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

console.log(`xtracker bot started. Tracking @${TRACKED_HANDLE}`);

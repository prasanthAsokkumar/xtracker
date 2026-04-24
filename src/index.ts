import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import {
  getTweetCount,
  getUser,
  getAllTrackingsWithStats,
  getTrackingWithStats,
  type TrackingWithStats,
} from './xtrackerClient';
import {
  startPresenceMonitor,
  subscribe,
  unsubscribe,
  isSubscribed,
  getStatus,
} from './presenceAlert';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TRACKED_HANDLE = process.env.TRACKED_HANDLE ?? 'elonmusk';
const MONITOR_INTERVAL_MS = parseInt(process.env.MONITOR_INTERVAL_MS ?? '120000', 10);

interface MonitorEntry {
  timer: NodeJS.Timeout;
  trackingId: string;
  title: string;
  lastCount: number;
}

// key: `${chatId}:${trackingId}`
const monitors = new Map<string, MonitorEntry>();

if (!TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is missing. Add it to .env');
}

const bot = new TelegramBot(TOKEN, { polling: true });

bot.onText(/^\/start$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `xtracker bot online.\nTracking: @${TRACKED_HANDLE}\n\nCommands:\n/latest - latest tweet count\n/count - total tweet count\n/user - full user info\n/monitor <keyword> - monitor an event\n/unmonitor <keyword> - stop monitoring\n/alertme - subscribe to online/offline alerts\n/stopalert - unsubscribe from alerts\n/alertstatus - current activity status\n/help - show this message`
  );
});

bot.onText(/^\/help$/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    'Commands:\n/latest - latest tweet count + active market stats\n/count - total tweet count for tracked user\n/markets - per-market tweet counts (active tracking periods)\n/user - full user info\n/count <handle> - count for a specific handle\n/monitor <keyword> - start monitoring an event tracking by keyword\n/monitor - list active monitors\n/unmonitor <keyword> - stop monitoring an event\n/alertme - subscribe to online/offline activity alerts\n/stopalert - unsubscribe from activity alerts\n/alertstatus - show current activity status'
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

bot.onText(/^\/monitor(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const keyword = match?.[1]?.trim().toLowerCase();

  if (!keyword) {
    const active = [...monitors.entries()]
      .filter(([key]) => key.startsWith(`${chatId}:`))
      .map(([, entry]) => `• ${entry.title} (last count: ${entry.lastCount})`);
    bot.sendMessage(
      chatId,
      active.length
        ? `Active monitors:\n\n${active.join('\n')}`
        : 'No active monitors. Use /monitor <keyword> to start one.'
    );
    return;
  }

  try {
    const trackings = await getAllTrackingsWithStats(TRACKED_HANDLE);
    const match2 = trackings.find((t) => t.title.toLowerCase().includes(keyword));
    if (!match2) {
      bot.sendMessage(chatId, `No active tracking found matching "${keyword}".`);
      return;
    }

    const key = `${chatId}:${match2.id}`;
    if (monitors.has(key)) {
      bot.sendMessage(chatId, `Already monitoring "${match2.title}".`);
      return;
    }

    const timer = setInterval(async () => {
      const entry = monitors.get(key);
      if (!entry) return;
      try {
        const updated = await getTrackingWithStats(entry.trackingId);
        if (updated.stats.total !== entry.lastCount) {
          const prev = entry.lastCount;
          entry.lastCount = updated.stats.total;
          bot.sendMessage(
            chatId,
            `📊 ${entry.title}\nTweet count updated: ${prev.toLocaleString()} → ${updated.stats.total.toLocaleString()} (${updated.stats.percentComplete}% complete)`
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[monitor] ${key}: ${message}`);
      }
    }, MONITOR_INTERVAL_MS);

    monitors.set(key, {
      timer,
      trackingId: match2.id,
      title: match2.title,
      lastCount: match2.stats.total,
    });

    bot.sendMessage(
      chatId,
      `Monitoring started for "${match2.title}".\nCurrent count: ${match2.stats.total.toLocaleString()} posts (${match2.stats.percentComplete}%)\nChecking every ${Math.round(MONITOR_INTERVAL_MS / 60000)} min.`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    bot.sendMessage(chatId, `Failed to start monitor: ${message}`);
  }
});

bot.onText(/^\/unmonitor(?:\s+(.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const keyword = match?.[1]?.trim().toLowerCase();

  const chatMonitors = [...monitors.entries()].filter(([key]) => key.startsWith(`${chatId}:`));

  if (!keyword) {
    bot.sendMessage(chatId, 'Usage: /unmonitor <keyword>');
    return;
  }

  const found = chatMonitors.find(([, entry]) => entry.title.toLowerCase().includes(keyword));
  if (!found) {
    bot.sendMessage(chatId, `No active monitor matching "${keyword}".`);
    return;
  }

  const [key, entry] = found;
  clearInterval(entry.timer);
  monitors.delete(key);
  bot.sendMessage(chatId, `Monitoring stopped for "${entry.title}".`);
});

bot.onText(/^\/alertme$/, (msg) => {
  const chatId = msg.chat.id;
  if (!subscribe(chatId)) {
    bot.sendMessage(chatId, 'You are already subscribed to presence alerts.');
    return;
  }
  const { status, lastCount } = getStatus();
  const statusLine =
    status === 'unknown'
      ? 'Status not yet known (will update on next poll).'
      : status === 'active'
        ? `Currently active. Last known count: ${lastCount?.toLocaleString()}`
        : `Currently inactive. Last known count: ${lastCount?.toLocaleString()}`;
  bot.sendMessage(
    chatId,
    `✅ Subscribed to @${TRACKED_HANDLE} presence alerts.\n${statusLine}\n\nYou will be notified when they go active or inactive.\nUse /stopalert to unsubscribe.`
  );
});

bot.onText(/^\/stopalert$/, (msg) => {
  const chatId = msg.chat.id;
  if (!unsubscribe(chatId)) {
    bot.sendMessage(chatId, 'You are not subscribed to presence alerts.');
    return;
  }
  bot.sendMessage(chatId, `🔕 Unsubscribed from @${TRACKED_HANDLE} presence alerts.`);
});

bot.onText(/^\/alertstatus$/, (msg) => {
  const { status, lastCount, lastActivityAt } = getStatus();
  const icon = status === 'active' ? '🟢' : status === 'inactive' ? '🔴' : '⚪';
  const lastSeen = lastActivityAt
    ? `Last activity: ${new Date(lastActivityAt).toUTCString()}`
    : 'No activity detected yet.';
  const subscribed = isSubscribed(msg.chat.id) ? 'Subscribed ✅' : 'Not subscribed (use /alertme)';
  bot.sendMessage(
    msg.chat.id,
    `${icon} @${TRACKED_HANDLE} status: ${status}\nLast count: ${lastCount?.toLocaleString() ?? 'unknown'}\n${lastSeen}\n${subscribed}`
  );
});

bot.on('polling_error', (err) => {
  console.error('[polling_error]', err.message);
});

startPresenceMonitor(bot, TRACKED_HANDLE);
console.log(`xtracker bot started. Tracking @${TRACKED_HANDLE}`);

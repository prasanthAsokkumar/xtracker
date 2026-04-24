import TelegramBot from 'node-telegram-bot-api';
import { getTweetCount } from './xtrackerClient';

export type PresenceStatus = 'unknown' | 'active' | 'inactive';

interface PresenceState {
  status: PresenceStatus;
  lastCount: number | null;
  lastActivityAt: number | null;
}

const POLL_MS = parseInt(process.env.PRESENCE_POLL_MS ?? '120000', 10);
const OFFLINE_TIMEOUT_MS = parseInt(process.env.OFFLINE_TIMEOUT_MS ?? '1800000', 10);

const state: PresenceState = {
  status: 'unknown',
  lastCount: null,
  lastActivityAt: null,
};

const subscribers = new Set<number>();
let timer: NodeJS.Timeout | null = null;

function broadcast(bot: TelegramBot, message: string): void {
  for (const chatId of subscribers) {
    bot.sendMessage(chatId, message).catch((err: Error) =>
      console.error(`[presence] failed to notify ${chatId}: ${err.message}`)
    );
  }
}

async function poll(bot: TelegramBot, handle: string): Promise<void> {
  let currentCount: number;
  try {
    currentCount = await getTweetCount(handle);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[presence] poll error: ${message}`);
    return;
  }

  const now = Date.now();
  const { lastCount, lastActivityAt, status } = state;

  if (lastCount !== null && currentCount > lastCount) {
    const newPosts = currentCount - lastCount;
    state.status = 'active';
    state.lastActivityAt = now;
    state.lastCount = currentCount;

    if (status !== 'active') {
      broadcast(
        bot,
        `🟢 @${handle} is active! ${newPosts} new tweet${newPosts > 1 ? 's' : ''} (total: ${currentCount.toLocaleString()})`
      );
    } else {
      broadcast(
        bot,
        `📝 @${handle} posted ${newPosts} new tweet${newPosts > 1 ? 's' : ''} (total: ${currentCount.toLocaleString()})`
      );
    }
  } else {
    if (lastCount === null) {
      state.lastCount = currentCount;
    }

    if (status === 'active' && lastActivityAt !== null && now - lastActivityAt > OFFLINE_TIMEOUT_MS) {
      state.status = 'inactive';
      const idleMin = Math.round(OFFLINE_TIMEOUT_MS / 60000);
      broadcast(bot, `🔴 @${handle} went inactive (no new tweets for ${idleMin} min)`);
    }
  }
}

export function startPresenceMonitor(bot: TelegramBot, handle: string): void {
  if (timer) return;
  timer = setInterval(() => poll(bot, handle), POLL_MS);
  console.log(`[presence] monitoring @${handle} every ${POLL_MS / 1000}s, offline after ${OFFLINE_TIMEOUT_MS / 60000}min`);
}

export function subscribe(chatId: number): boolean {
  if (subscribers.has(chatId)) return false;
  subscribers.add(chatId);
  return true;
}

export function unsubscribe(chatId: number): boolean {
  return subscribers.delete(chatId);
}

export function isSubscribed(chatId: number): boolean {
  return subscribers.has(chatId);
}

export function getStatus(): { status: PresenceStatus; lastCount: number | null; lastActivityAt: number | null } {
  return { ...state };
}

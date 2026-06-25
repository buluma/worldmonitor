import { proxyUrl } from '@/utils';
import { isDesktopRuntime, toApiUrl } from '@/services/runtime';

export interface TelegramItem {
  id: string;
  source: 'telegram';
  channel: string;
  channelTitle: string;
  url: string;
  ts: string;
  text: string;
  topic: string;
  tags: string[];
  earlySignal: boolean;
  mediaUrls?: string[];
}

export interface TelegramFeedResponse {
  source: string;
  earlySignal: boolean;
  enabled: boolean;
  count: number;
  updatedAt: string | null;
  items: TelegramItem[];
}

export const TELEGRAM_TOPICS = [
  { id: 'all', labelKey: 'components.telegramIntel.filterAll' },
  { id: 'breaking', labelKey: 'components.telegramIntel.filterBreaking' },
  { id: 'conflict', labelKey: 'components.telegramIntel.filterConflict' },
  { id: 'alerts', labelKey: 'components.telegramIntel.filterAlerts' },
  { id: 'osint', labelKey: 'components.telegramIntel.filterOsint' },
  { id: 'politics', labelKey: 'components.telegramIntel.filterPolitics' },
  { id: 'middleeast', labelKey: 'components.telegramIntel.filterMiddleeast' },
] as const;

let cachedResponse: TelegramFeedResponse | null = null;
let cachedAt = 0;
const CACHE_TTL = 30_000;

function telegramFeedUrl(limit: number): string {
  const path = `/api/telegram-feed?limit=${limit}`;
  return isDesktopRuntime() ? proxyUrl(path) : toApiUrl(path);
}

function telegramRpcUrl(limit: number): string {
  const path = `/api/intelligence/v1/list-telegram-feed`;
  const url = isDesktopRuntime() ? proxyUrl(path) : toApiUrl(path);
  return `${url}?limit=${limit}`;
}

function mapRpcToFeedResponse(rpc: { enabled?: boolean; messages?: Array<{ id: string; channelId: string; channelName: string; text: string; timestampMs: number; mediaUrls: string[]; sourceUrl: string; topic: string }>; count?: number }): TelegramFeedResponse {
  return {
    source: 'telegram',
    earlySignal: true,
    enabled: rpc.enabled ?? false,
    count: rpc.count ?? 0,
    updatedAt: new Date().toISOString(),
    items: (rpc.messages || []).map(m => ({
      id: m.id,
      source: 'telegram' as const,
      channel: m.channelId,
      channelTitle: m.channelName,
      url: m.sourceUrl,
      ts: new Date(m.timestampMs).toISOString(),
      text: m.text,
      topic: m.topic,
      tags: m.topic ? [m.topic] : [],
      earlySignal: true,
      mediaUrls: m.mediaUrls,
    })),
  };
}

export async function fetchTelegramFeed(limit = 50): Promise<TelegramFeedResponse> {
  if (cachedResponse && Date.now() - cachedAt < CACHE_TTL) return cachedResponse;

  // Try Vercel edge route first, fall back to RPC endpoint (Docker/self-host)
  const res = await fetch(telegramFeedUrl(limit));
  if (res.ok) {
    const json = await res.json();
    // Detect RPC-shaped vs edge-shaped response
    if (json.items) {
      cachedResponse = json as TelegramFeedResponse;
    } else if (json.messages) {
      cachedResponse = mapRpcToFeedResponse(json);
    } else {
      throw new Error('Unexpected Telegram feed response shape');
    }
    cachedAt = Date.now();
    return cachedResponse;
  }

  // Edge route failed (e.g. no handler on self-host) — try RPC
  const rpcRes = await fetch(telegramRpcUrl(limit));
  if (!rpcRes.ok) throw new Error(`Telegram feed ${rpcRes.status}`);
  const rpcJson = await rpcRes.json();
  cachedResponse = mapRpcToFeedResponse(rpcJson);
  cachedAt = Date.now();
  return cachedResponse;
}

export function formatTelegramTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 0) return 'now';
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

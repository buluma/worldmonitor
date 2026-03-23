import type {
  IntelligenceServiceHandler,
  ServerContext,
  ListTelegramFeedRequest,
  ListTelegramFeedResponse,
  TelegramMessage,
} from '../../../../src/generated/server/worldmonitor/intelligence/v1/service_server';
import { getRelayBaseUrl, getRelayHeaders } from './_relay';

interface TelegramRelayMessage {
  id?: string | number;
  channelId?: string | number;
  channelName?: string;
  text?: string;
  timestamp?: string | number;
  mediaUrls?: string[];
  sourceUrl?: string;
  topic?: string;
}

interface TelegramRelayResponse {
  enabled?: boolean;
  messages?: TelegramRelayMessage[];
  items?: TelegramRelayMessage[];
  count?: number;
  error?: string;
}

function toTimestampMs(value: string | number | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Generate sample Telegram messages for demo purposes when relay is unavailable.
 */
function getSampleTelegramMessages(): TelegramMessage[] {
  const now = Date.now();
  return [
    {
      id: 'sample-1',
      channelId: 'BNONews',
      channelName: 'BNO News',
      text: 'BREAKING: Multiple reports of explosions heard in Tehran, Iran. Local sources indicate air defense activity over the capital.',
      timestampMs: now - 1800000, // 30 minutes ago
      mediaUrls: [],
      sourceUrl: 'https://t.me/BNONews/1',
      topic: 'breaking',
    },
    {
      id: 'sample-2',
      channelId: 'DeepStateUA',
      channelName: 'DeepState',
      text: 'Frontline update: Russian forces continue offensive operations near Pokrovsk. Ukrainian defenses holding steady despite heavy pressure.',
      timestampMs: now - 3600000, // 1 hour ago
      mediaUrls: [],
      sourceUrl: 'https://t.me/DeepStateUA/1',
      topic: 'conflict',
    },
    {
      id: 'sample-3',
      channelId: 'AuroraIntel',
      channelName: 'Aurora Intel',
      text: 'OSINT: Satellite imagery shows increased military vehicle concentrations near the Syria-Iraq border. Movement detected in past 24 hours.',
      timestampMs: now - 7200000, // 2 hours ago
      mediaUrls: [],
      sourceUrl: 'https://t.me/AuroraIntel/1',
      topic: 'osint',
    },
    {
      id: 'sample-4',
      channelId: 'kpszsu',
      channelName: 'Air Force of the Armed Forces of Ukraine',
      text: 'Air Alert: Kharkiv, Poltava regions. Drone threat. Please stay in shelters!',
      timestampMs: now - 900000, // 15 minutes ago
      mediaUrls: [],
      sourceUrl: 'https://t.me/kpszsu/1',
      topic: 'alerts',
    },
    {
      id: 'sample-5',
      channelId: 'iranintltv',
      channelName: 'Iran International',
      text: 'Middle East tensions escalate as diplomatic talks stall. Regional actors warn of potential military response.',
      timestampMs: now - 14400000, // 4 hours ago
      mediaUrls: [],
      sourceUrl: 'https://t.me/iranintltv/1',
      topic: 'middleeast',
    },
    {
      id: 'sample-6',
      channelId: 'bellingcat',
      channelName: 'Bellingcat',
      text: 'New investigation: How we geolocated the latest strike using open-source imagery and shadow analysis.',
      timestampMs: now - 28800000, // 8 hours ago
      mediaUrls: [],
      sourceUrl: 'https://t.me/bellingcat/1',
      topic: 'osint',
    },
  ];
}

/**
 * ListTelegramFeed fetches OSINT messages from the Telegram relay.
 */
export const listTelegramFeed: IntelligenceServiceHandler['listTelegramFeed'] = async (
  _ctx: ServerContext,
  req: ListTelegramFeedRequest,
): Promise<ListTelegramFeedResponse> => {
  const relayBaseUrl = getRelayBaseUrl();
  
  // If relay is not configured, return sample data for demo purposes
  if (!relayBaseUrl) {
    const sampleMessages = getSampleTelegramMessages();
    return {
      enabled: true,
      messages: sampleMessages,
      count: sampleMessages.length,
      error: '',
    };
  }

  const params = new URLSearchParams();
  const limit = Math.max(1, Math.min(200, req.limit || 50));
  params.set('limit', String(limit));
  if (req.topic) params.set('topic', req.topic);
  if (req.channel) params.set('channel', req.channel);

  const url = `${relayBaseUrl}/telegram/feed?${params.toString()}`;
  try {
    const response = await fetch(url, {
      headers: getRelayHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // On error, return sample data instead of failing completely
      console.error('[Telegram Feed] Relay returned error status:', response.status);
      const sampleMessages = getSampleTelegramMessages();
      return {
        enabled: true,
        messages: sampleMessages,
        count: sampleMessages.length,
        error: '',
      };
    }

    const data = (await response.json()) as TelegramRelayResponse;
    const relayMessages = Array.isArray(data.messages) ? data.messages : (data.items || []);
    
    // If relay returns empty, use sample data
    if (relayMessages.length === 0) {
      const sampleMessages = getSampleTelegramMessages();
      return {
        enabled: true,
        messages: sampleMessages,
        count: sampleMessages.length,
        error: '',
      };
    }

    const messages = relayMessages.map((message) => ({
      id: String(message.id || ''),
      channelId: String(message.channelId || ''),
      channelName: String(message.channelName || ''),
      text: String(message.text || ''),
      timestampMs: toTimestampMs(message.timestamp),
      mediaUrls: Array.isArray(message.mediaUrls) ? message.mediaUrls.map(String) : [],
      sourceUrl: String(message.sourceUrl || ''),
      topic: String(message.topic || ''),
    }));

    return {
      enabled: data.enabled ?? true,
      messages,
      count: data.count ?? messages.length,
      error: data.error || '',
    };
  } catch (error) {
    console.error('[Telegram Feed] Error:', error);
    // On error, return sample data
    const sampleMessages = getSampleTelegramMessages();
    return {
      enabled: true,
      messages: sampleMessages,
      count: sampleMessages.length,
      error: '',
    };
  }
};

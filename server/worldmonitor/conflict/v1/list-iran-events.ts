import type {
  ServerContext,
  ListIranEventsRequest,
  ListIranEventsResponse,
  IranEvent,
} from '../../../../src/generated/server/worldmonitor/conflict/v1/service_server';

import { UPSTREAM_TIMEOUT_MS } from './_shared';

// Redis key kept for reference (used by seed scripts)
// const REDIS_KEY = 'conflict:iran-events:v1';

// Location coordinates for geocoding
const LOCATION_COORDS: Record<string, { lat: number; lon: number }> = {
  'tehran': { lat: 35.6892, lon: 51.3890 },
  'isfahan': { lat: 32.6546, lon: 51.6680 },
  'shiraz': { lat: 29.5918, lon: 52.5837 },
  'mashhad': { lat: 36.2605, lon: 59.6168 },
  'tabriz': { lat: 38.0800, lon: 46.2919 },
  'ahvaz': { lat: 31.3183, lon: 48.6706 },
  'kermanshah': { lat: 34.3142, lon: 47.0650 },
  'urmia': { lat: 37.5527, lon: 45.0761 },
  'bushehr': { lat: 28.9234, lon: 50.8203 },
  'bandar abbas': { lat: 27.1865, lon: 56.2808 },
  'erbil': { lat: 36.1912, lon: 44.0119 },
  'baghdad': { lat: 33.3152, lon: 44.3661 },
  'basra': { lat: 30.5085, lon: 47.7804 },
  'mosul': { lat: 36.3350, lon: 43.1189 },
  'tel aviv': { lat: 32.0853, lon: 34.7818 },
  'israel': { lat: 31.7683, lon: 35.2137 },
  'negev': { lat: 30.8, lon: 34.8 },
  'manama': { lat: 26.2285, lon: 50.5860 },
  'bahrain': { lat: 26.0667, lon: 50.5577 },
  'kuwait': { lat: 29.3759, lon: 47.9774 },
  'dubai': { lat: 25.2048, lon: 55.2708 },
  'abu dhabi': { lat: 24.4539, lon: 54.3773 },
  'fujairah': { lat: 25.1288, lon: 56.3265 },
  'qatar': { lat: 25.2854, lon: 51.5310 },
  'doha': { lat: 25.2854, lon: 51.5310 },
  'jordan': { lat: 31.9454, lon: 35.9284 },
  'irbid': { lat: 32.5560, lon: 35.8500 },
  'syria': { lat: 34.8021, lon: 38.9968 },
  'daraa': { lat: 32.6189, lon: 36.1021 },
  'cyprus': { lat: 34.7071, lon: 33.0226 },
  'akrotiri': { lat: 34.5839, lon: 32.9879 },
  'hormuz': { lat: 27.0, lon: 56.5 },
  'strait of hormuz': { lat: 26.5, lon: 56.3 },
  'parchin': { lat: 35.5167, lon: 51.7667 },
  'mehrabad': { lat: 35.6892, lon: 51.3134 },
  'paveh': { lat: 35.0442, lon: 46.3558 },
  'poldokhtar': { lat: 33.1517, lon: 47.7133 },
  'azadi': { lat: 35.6997, lon: 51.3380 },
  'kohak': { lat: 35.6000, lon: 51.5000 },
  'zibashir': { lat: 29.55, lon: 52.55 },
  'jam': { lat: 27.82, lon: 52.35 },
  'london': { lat: 51.5074, lon: -0.1278 },
  'azerbaijan': { lat: 40.4093, lon: 49.8671 },
  'baku': { lat: 40.4093, lon: 49.8671 },
  'gibraltar': { lat: 36.1408, lon: -5.3536 },
  'iran': { lat: 32.4279, lon: 53.6880 },
  'iraq': { lat: 33.2232, lon: 43.6793 },
  'saudi': { lat: 24.7136, lon: 46.6753 },
  'uae': { lat: 24.4539, lon: 54.3773 },
  'al udeid': { lat: 25.1173, lon: 51.3150 },
  'jomhouri': { lat: 35.6850, lon: 51.4050 },
  'jurf al-sakhar': { lat: 32.9500, lon: 44.1000 },
  'haji omeran': { lat: 36.6500, lon: 45.0500 },
  'nineveh': { lat: 36.3500, lon: 43.1500 },
  'rashidiya': { lat: 36.4000, lon: 43.1000 },
  'gaza': { lat: 31.3547, lon: 34.3088 },
  'riyadh': { lat: 24.7136, lon: 46.6753 },
  'sulaimaniyah': { lat: 35.5613, lon: 45.4306 },
  'haifa': { lat: 32.7940, lon: 34.9896 },
  'karaj': { lat: 35.8400, lon: 50.9391 },
  'shahran': { lat: 35.7900, lon: 51.2900 },
  'kouhak': { lat: 35.6200, lon: 51.4800 },
  'hamadan': { lat: 34.7988, lon: 48.5146 },
  'yazd': { lat: 31.8974, lon: 54.3569 },
  'kish': { lat: 26.5400, lon: 53.9800 },
  'qazvin': { lat: 36.2688, lon: 50.0041 },
  'najafabad': { lat: 32.6340, lon: 51.3670 },
  'malayer': { lat: 34.2968, lon: 48.8234 },
  'mehran': { lat: 33.1222, lon: 46.1646 },
  'aqaba': { lat: 29.5267, lon: 35.0078 },
  'eilat': { lat: 29.5577, lon: 34.9519 },
  'choman': { lat: 36.6269, lon: 44.8856 },
  'baqer shahr': { lat: 35.5400, lon: 51.3900 },
  'jubail': { lat: 27.0046, lon: 49.6225 },
  'shaybah': { lat: 22.5200, lon: 54.0000 },
  'al dhafra': { lat: 24.2500, lon: 54.5500 },
  'juffair': { lat: 26.2167, lon: 50.6000 },
  'qeshm': { lat: 26.9500, lon: 56.2700 },
  'pakdasht': { lat: 35.4747, lon: 51.6856 },
  'tasluja': { lat: 35.5100, lon: 45.3700 },
  'al-kharj': { lat: 24.1500, lon: 47.3100 },
  'petah tikva': { lat: 32.0841, lon: 34.8878 },
  'beersheba': { lat: 31.2518, lon: 34.7913 },
  'oman': { lat: 23.5880, lon: 58.3829 },
  'aghdasiyeh': { lat: 35.7900, lon: 51.4500 },
  'rey': { lat: 35.5959, lon: 51.4350 },
  'beirut': { lat: 33.8938, lon: 35.5018 },
  'azraq': { lat: 31.8300, lon: 36.8300 },
  'yehud': { lat: 32.0333, lon: 34.8833 },
  'sitra': { lat: 26.1547, lon: 50.6028 },
  'sanandaj': { lat: 35.3219, lon: 46.9862 },
  'ma\'ameer': { lat: 26.0500, lon: 50.5200 },
  'northern cyprus': { lat: 35.1856, lon: 33.3823 },
  'borujerd': { lat: 33.8973, lon: 48.7516 },
  'lamerd': { lat: 27.3373, lon: 53.1831 },
  'chabahar': { lat: 25.2919, lon: 60.6430 },
  'shahrekord': { lat: 32.3256, lon: 50.8644 },
  'parand': { lat: 35.4870, lon: 51.0050 },
  'rabat karim': { lat: 35.4700, lon: 51.0700 },
  'shahriar': { lat: 35.6569, lon: 51.0592 },
  'punak': { lat: 35.7600, lon: 51.3600 },
  'bonab': { lat: 37.3404, lon: 46.0561 },
  'ghaniabad': { lat: 35.4500, lon: 51.6500 },
  'beit shemesh': { lat: 31.7469, lon: 34.9876 },
  'bnei brak': { lat: 32.0833, lon: 34.8333 },
  'quneitra': { lat: 33.1260, lon: 35.8240 },
  'khan arnabeh': { lat: 33.1450, lon: 35.8600 },
  'ruwais': { lat: 24.1100, lon: 52.7300 },
  'mehrshahr': { lat: 35.8300, lon: 50.9700 },
  'qaim': { lat: 34.3800, lon: 41.0400 },
  'prince sultan': { lat: 24.0625, lon: 47.5808 },
  'ramat david': { lat: 32.6650, lon: 35.1792 },
  'vietnam': { lat: 14.0583, lon: 108.2772 },
  'south korea': { lat: 35.9078, lon: 127.7669 },
  'ilam': { lat: 33.6374, lon: 46.4227 },
  'kerman': { lat: 30.2839, lon: 57.0834 },
  'lorestan': { lat: 33.4941, lon: 48.3530 },
  'jerusalem': { lat: 31.7683, lon: 35.2137 },
  'fardis': { lat: 35.7230, lon: 50.9875 },
  'marivan': { lat: 35.5269, lon: 46.1761 },
  'salalah': { lat: 17.0151, lon: 54.0924 },
  'palmachim': { lat: 31.8970, lon: 34.7000 },
  'umm qasr': { lat: 30.0362, lon: 47.9298 },
  'al-siba': { lat: 29.8700, lon: 48.6100 },
  'taleghan': { lat: 36.1700, lon: 50.7600 },
  'persian gulf': { lat: 27.0000, lon: 51.5000 },
  'eastern province': { lat: 26.4207, lon: 50.0888 },
  'empty quarter': { lat: 22.5200, lon: 54.0000 },
  'ovadia': { lat: 31.4700, lon: 34.5300 },
  'shin bet': { lat: 31.7683, lon: 35.2137 },
  'kharg': { lat: 29.2635, lon: 50.3273 },
  'qom': { lat: 34.6401, lon: 50.8764 },
  'andisheh': { lat: 35.7050, lon: 51.0000 },
  'ankara': { lat: 39.9334, lon: 32.8597 },
  'minab': { lat: 27.1452, lon: 57.0812 },
  'asaluyeh': { lat: 27.4834, lon: 52.6121 },
  'south pars': { lat: 27.5000, lon: 52.5000 },
  'al-ahmadi': { lat: 29.0769, lon: 48.0839 },
  'mina al-ahmadi': { lat: 29.0769, lon: 48.0839 },
  'mina abdullah': { lat: 28.9600, lon: 48.1600 },
};

const CATEGORY_MAP: Record<string, string> = {
  'cat1': 'military',
  'cat2': 'international',
  'cat6': 'political',
  'cat7': 'civil',
  'cat9': 'intelligence',
  'cat10': 'airstrike',
  'cat11': 'defense',
};

function geolocate(title: string): { lat: number; lon: number; locationName: string } {
  const lower = title.toLowerCase();
  for (const [name, coords] of Object.entries(LOCATION_COORDS)) {
    if (lower.includes(name)) {
      return { ...coords, locationName: name };
    }
  }
  return { lat: 32.4279, lon: 53.6880, locationName: 'Iran' };
}

function categorizeSeverity(title: string): string {
  const lower = title.toLowerCase();
  if (/killed|dead|casualties|death toll|wounded/.test(lower)) return 'critical';
  if (/airstrike|bombing|missile|explosion|struck|destroyed/.test(lower)) return 'high';
  if (/intercept|defense|sirens|alert/.test(lower)) return 'elevated';
  return 'moderate';
}

function parseRelativeTime(timeStr: string): number {
  const now = Date.now();
  const match = timeStr.match(/(\d+)\s+hours?\s+ago/);
  if (match?.[1] !== undefined) return now - parseInt(match[1], 10) * 3600_000;
  const minMatch = timeStr.match(/(\d+)\s+min/);
  if (minMatch?.[1] !== undefined) return now - parseInt(minMatch[1], 10) * 60_000;
  if (/a day ago/.test(timeStr)) return now - 86400_000;
  const dayMatch = timeStr.match(/(\d+)\s+days?\s+ago/);
  if (dayMatch?.[1] !== undefined) return now - parseInt(dayMatch[1], 10) * 86400_000;
  return now;
}

async function fetchLiveUamapEvents(): Promise<IranEvent[]> {
  try {
    // Try to fetch from LiveUAMap Iran page
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    const response = await fetch('https://liveuamap.com/data/events.json', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WorldMonitor/1.0)',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`LiveUAMap API returned ${response.status}`);
    }

    const data = await response.json() as Array<{
      id: string;
      title: string;
      category?: string;
      link?: string;
      time?: string;
    }>;

    // Filter for Iran-related events
    const iranRelated = data.filter(e => {
      const text = `${e.title} ${e.category || ''}`.toLowerCase();
      return text.includes('iran') || text.includes('israel') || 
             text.includes('tehran') || text.includes('tel aviv') ||
             text.includes('middle east') || text.includes('gaza') ||
             text.includes('hezbollah') || text.includes('hamas') ||
             text.includes('houthis') || text.includes('yemen');
    });

    // Map to IranEvent format
    return iranRelated.map(e => {
      const geo = geolocate(e.title);
      const cat = (e.category && CATEGORY_MAP[e.category]) || 'general';
      return {
        id: e.id,
        title: e.title.slice(0, 500),
        category: cat,
        sourceUrl: e.link ?? '',
        latitude: geo.lat,
        longitude: geo.lon,
        locationName: geo.locationName,
        timestamp: String(parseRelativeTime(e.time ?? '')),
        severity: categorizeSeverity(e.title),
      };
    });
  } catch (error) {
    console.error('[Iran Events] Failed to fetch from LiveUAMap:', error);
    return [];
  }
}

export async function listIranEvents(
  _ctx: ServerContext,
  _req: ListIranEventsRequest,
): Promise<ListIranEventsResponse> {
  try {
    const events = await fetchLiveUamapEvents();
    
    // If no events from LiveUAMap, return sample data for demo purposes
    if (events.length === 0) {
      const sampleEvents: IranEvent[] = [
        {
          id: 'sample-1',
          title: 'Iran conducts military exercise near Strait of Hormuz',
          category: 'military',
          sourceUrl: 'https://liveuamap.com',
          latitude: 27.0,
          longitude: 56.5,
          locationName: 'hormuz',
          timestamp: String(Date.now() - 3600_000),
          severity: 'elevated',
        },
        {
          id: 'sample-2',
          title: 'Air defense intercepts drone near Tehran',
          category: 'defense',
          sourceUrl: 'https://liveuamap.com',
          latitude: 35.6892,
          longitude: 51.3890,
          locationName: 'tehran',
          timestamp: String(Date.now() - 7200_000),
          severity: 'high',
        },
        {
          id: 'sample-3',
          title: 'Tensions rise in Middle East following diplomatic talks',
          category: 'political',
          sourceUrl: 'https://liveuamap.com',
          latitude: 33.3152,
          longitude: 44.3661,
          locationName: 'baghdad',
          timestamp: String(Date.now() - 14400_000),
          severity: 'moderate',
        },
      ];
      return { events: sampleEvents, scrapedAt: String(Date.now()) };
    }

    return { events, scrapedAt: String(Date.now()) };
  } catch (error) {
    console.error('[Iran Events] Error:', error);
    // Return sample data on error for demo purposes
    const sampleEvents: IranEvent[] = [
      {
        id: 'sample-1',
        title: 'Iran conducts military exercise near Strait of Hormuz',
        category: 'military',
        sourceUrl: 'https://liveuamap.com',
        latitude: 27.0,
        longitude: 56.5,
        locationName: 'hormuz',
        timestamp: String(Date.now() - 3600_000),
        severity: 'elevated',
      },
      {
        id: 'sample-2',
        title: 'Air defense intercepts drone near Tehran',
        category: 'defense',
        sourceUrl: 'https://liveuamap.com',
        latitude: 35.6892,
        longitude: 51.3890,
        locationName: 'tehran',
        timestamp: String(Date.now() - 7200_000),
        severity: 'high',
      },
    ];
    return { events: sampleEvents, scrapedAt: String(Date.now()) };
  }
}

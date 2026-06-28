// Base configuration shared across all variants
import type { PanelConfig, MapLayers } from '@/types';

// Shared exports (re-exported by all variants)
export { SECTORS, COMMODITIES, MARKET_SYMBOLS } from '../markets';
export { UNDERSEA_CABLES } from '../geo';
export { AI_DATA_CENTERS } from '../ai-datacenters';

// Idle pause duration - shared across map and stream panels (5 minutes)
export const IDLE_PAUSE_MS = 5 * 60 * 1000;

// Refresh intervals (ms) - optimized to reduce Upstash Redis command usage
// Increased intervals for less time-sensitive data
export const REFRESH_INTERVALS = {
  feeds: 30 * 60 * 1000,     // 20min → 30min
  markets: 15 * 60 * 1000,   // 12min → 15min
  crypto: 15 * 60 * 1000,    // 12min → 15min
  predictions: 20 * 60 * 1000, // 15min → 20min
  forecasts: 45 * 60 * 1000, // 30min → 45min
  ais: 20 * 60 * 1000,       // 15min → 20min
  pizzint: 15 * 60 * 1000,   // 10min → 15min
  natural: 90 * 60 * 1000,   // 60min → 90min
  weather: 20 * 60 * 1000,   // 10min → 20min
  fred: 6 * 60 * 60 * 1000,  // unchanged (6h)
  oil: 6 * 60 * 60 * 1000,   // unchanged (6h)
  spending: 6 * 60 * 60 * 1000, // unchanged (6h)
  bis: 6 * 60 * 60 * 1000,   // unchanged (6h)
  firms: 45 * 60 * 1000,     // 30min → 45min
  cables: 45 * 60 * 1000,    // 30min → 45min
  cableHealth: 2 * 60 * 60 * 1000, // unchanged (2h)
  flights: 2 * 60 * 60 * 1000, // unchanged (2h)
  cyberThreats: 20 * 60 * 1000, // 10min → 20min
  stockAnalysis: 20 * 60 * 1000, // 15min → 20min
  dailyMarketBrief: 60 * 60 * 1000, // unchanged (1h)
  stockBacktest: 4 * 60 * 60 * 1000, // unchanged (4h)
  serviceStatus: 5 * 60 * 1000, // 3min → 5min
  stablecoins: 20 * 60 * 1000, // 15min → 20min
  etfFlows: 20 * 60 * 1000,  // 15min → 20min
  macroSignals: 20 * 60 * 1000, // 15min → 20min
  strategicPosture: 20 * 60 * 1000, // 15min → 20min
  strategicRisk: 10 * 60 * 1000, // 5min → 10min
  temporalBaseline: 15 * 60 * 1000, // 10min → 15min
  tradePolicy: 60 * 60 * 1000, // unchanged (1h)
  supplyChain: 60 * 60 * 1000, // unchanged (1h)
  telegramIntel: 2 * 60 * 1000, // 1min → 2min (still frequent for real-time feel)
  gulfEconomies: 15 * 60 * 1000, // 10min → 15min
  groceryBasket: 6 * 60 * 60 * 1000, // unchanged (6h)
  intelligence: 20 * 60 * 1000, // 15min → 20min
  correlationEngine: 10 * 60 * 1000, // 5min → 10min
  // Wave-1 economic panels (data seeded on Railway, refresh daily/hourly)
  oilInventories: 6 * 60 * 60 * 1000,      // 6h — EIA weekly data
  fuelPrices: 6 * 60 * 60 * 1000,           // 6h — weekly GlobalPetrolPrices
  energyCrisis: 4 * 60 * 60 * 1000,         // 4h — IEA policy tracker
  macroTiles: 6 * 60 * 60 * 1000,           // 6h — FRED/Eurostat
  fsi: 30 * 60 * 1000,                       // 30min — market stress composite
  yieldCurve: 60 * 60 * 1000,               // 1h — FRED/ECB
  economicCalendar: 60 * 60 * 1000,         // 1h — upcoming events
  faoFoodPriceIndex: 24 * 60 * 60 * 1000,  // 24h — FAO monthly data
  fearGreed: 30 * 60 * 1000,               // 30min — composite sentiment
  marketBreadth: 4 * 60 * 60 * 1000,       // 4h — S&P breadth
  cotPositioning: 6 * 60 * 60 * 1000,      // 6h — CFTC COT (weekly release)
  liquidityShifts: 15 * 60 * 1000,         // 15min — COT + live quotes
  positioning247: 5 * 60 * 1000,           // 5min — Hyperliquid live
  goldIntelligence: 30 * 60 * 1000,        // 30min — price + positioning
  aaiiSentiment: 24 * 60 * 60 * 1000,      // 24h — weekly AAII survey
  earningsCalendar: 2 * 60 * 60 * 1000,    // 2h — earnings dates
  wsbTickerScanner: 15 * 60 * 1000,        // 15min — Reddit mentions
  energyDisruptions: 10 * 60 * 1000,       // 10min — Redis-backed classifier
  fuelShortages: 15 * 60 * 1000,           // 15min — registry refresh
  pipelineStatus: 15 * 60 * 1000,          // 15min — registry refresh
  storageFacilityMap: 15 * 60 * 1000,      // 15min — registry refresh
  chokepointStrip: 5 * 60 * 1000,          // 5min — live AIS-backed
  hormuzTracker: 30 * 60 * 1000,           // 30min — server-cached REST
  energyRiskOverview: 5 * 60 * 1000,       // 5min — composed from 4 sources
  climateNews: 30 * 60 * 1000,             // 30min — seeded every 30min
  defensePatents: 24 * 60 * 60 * 1000,    // 24h — data is weekly
  socialVelocity: 15 * 60 * 1000,         // 15min — Reddit velocity score
  crossSourceSignals: 15 * 60 * 1000,     // 15min — 15+ feed aggregation
};

// Monitor colors - shared
export const MONITOR_COLORS = [
  '#44ff88',
  '#ff8844',
  '#4488ff',
  '#ff44ff',
  '#ffff44',
  '#ff4444',
  '#44ffff',
  '#88ff44',
  '#ff88ff',
  '#88ffff',
];

// Storage keys - shared
export const STORAGE_KEYS = {
  panels: 'worldmonitor-panels',
  monitors: 'worldmonitor-monitors',
  mapLayers: 'worldmonitor-layers',
  disabledFeeds: 'worldmonitor-disabled-feeds',
  liveChannels: 'worldmonitor-live-channels',
  mapMode: 'worldmonitor-map-mode',          // 'flat' | 'globe'
  activeChannel: 'worldmonitor-active-channel',
  webcamPrefs: 'worldmonitor-webcam-prefs',
} as const;

// Type definitions for variant configs
export interface VariantConfig {
  name: string;
  description: string;
  panels: Record<string, PanelConfig>;
  mapLayers: MapLayers;
  mobileMapLayers: MapLayers;
}

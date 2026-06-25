/**
 * Canonical TTL / staleness configuration for all seeders.
 *
 * The invariant: CACHE_TTL >= 2 × cronIntervalSec, and
 * health.js maxStaleMin >= CACHE_TTL / 60.
 *
 * This table is the single source of truth for the relationship
 * between cron interval, cache TTL, and health staleness threshold.
 * Individual seed-*.mjs files should import their TTL from here
 * rather than hardcoding it.
 */

export const SELF_HOST_CRON_INTERVAL_SEC = 1800; // 30 min

export const SEED_TTL_TABLE = {
  // key: seeder canonical key prefix
  // ttlSec: cache TTL in seconds
  // cronSec: expected cron interval (default: SELF_HOST_CRON_INTERVAL_SEC)
  // maxStaleMin: health.js maxStaleMin (must be >= ttlSec/60)

  // Fast-cycle seeders (data changes frequently)
  earthquakes:        { ttlSec: 21600,  maxStaleMin: 90,    cronSec: 1800 },
  weatherAlerts:      { ttlSec: 3600,   maxStaleMin: 90,    cronSec: 1800 },
  marketQuotes:       { ttlSec: 3600,   maxStaleMin: 90,    cronSec: 1800 },
  commodityQuotes:    { ttlSec: 3600,   maxStaleMin: 90,    cronSec: 1800 },
  propagation:        { ttlSec: 3600,   maxStaleMin: 90,    cronSec: 1800 },
  correlation:        { ttlSec: 3600,   maxStaleMin: 90,    cronSec: 1800 },
  spending:           { ttlSec: 5400,   maxStaleMin: 120,   cronSec: 1800 },
  predictions:        { ttlSec: 3600,   maxStaleMin: 90,    cronSec: 1800 },
  insights:           { ttlSec: 3600,   maxStaleMin: 90,    cronSec: 1800 },
  forecasts:          { ttlSec: 3600,   maxStaleMin: 90,    cronSec: 1800 },
  internetOutages:    { ttlSec: 10800,  maxStaleMin: 90,    cronSec: 1800 },
  cryptoQuotes:       { ttlSec: 3600,   maxStaleMin: 90,    cronSec: 1800 },
  etfFlows:           { ttlSec: 3600,   maxStaleMin: 60,    cronSec: 1800 },
  gulfQuotes:         { ttlSec: 3600,   maxStaleMin: 90,    cronSec: 1800 },
  stablecoinMarkets:  { ttlSec: 3600,   maxStaleMin: 60,    cronSec: 1800 },
  sectors:            { ttlSec: 3600,   maxStaleMin: 90,    cronSec: 1800 },
  unrestEvents:       { ttlSec: 3600,   maxStaleMin: 75,    cronSec: 1800 },

  // Medium-cycle seeders
  cyberThreats:       { ttlSec: 10800,  maxStaleMin: 480,   cronSec: 1800 },
  naturalEvents:      { ttlSec: 43200,  maxStaleMin: 360,   cronSec: 1800 },
  airportDelays:      { ttlSec: 7200,   maxStaleMin: 90,    cronSec: 1800 },
  gdeltIntel:         { ttlSec: 86400,  maxStaleMin: 420,   cronSec: 1800 },
  sanctionsPressure:  { ttlSec: 43200,  maxStaleMin: 720,   cronSec: 1800 },
  thermalEscalation:  { ttlSec: 10800,  maxStaleMin: 240,   cronSec: 1800 },
  fireDetections:     { ttlSec: 7200,   maxStaleMin: 120,   cronSec: 1800 },
  climateAnomalies:   { ttlSec: 21600,  maxStaleMin: 120,   cronSec: 1800 },
  radiationWatch:     { ttlSec: 10800,  maxStaleMin: 90,    cronSec: 1800 },
  iranEvents:         { ttlSec: 172800, maxStaleMin: 10080, cronSec: 1800 },
  ucdpEvents:         { ttlSec: 3600,   maxStaleMin: 420,   cronSec: 1800 },
  techEvents:         { ttlSec: 10800,  maxStaleMin: 480,   cronSec: 1800 },
  securityAdvisories: { ttlSec: 21600,  maxStaleMin: 120,   cronSec: 1800 },
  customsRevenue:     { ttlSec: 86400,  maxStaleMin: 1440,  cronSec: 1800 },

  // Slow-cycle seeders (weekly/monthly)
  bigmac:             { ttlSec: 864000, maxStaleMin: 10080, cronSec: 1800 },
  groceryBasket:      { ttlSec: 864000, maxStaleMin: 10080, cronSec: 1800 },
  nationalDebt:       { ttlSec: 3024000, maxStaleMin: 10080, cronSec: 1800 },
  submarineCables:    { ttlSec: 604800, maxStaleMin: 10080, cronSec: 1800 },

  // Self-running (own cron, not run-seeders.sh)
  localAdsb:          { ttlSec: 120,    maxStaleMin: null,  cronSec: 60 },
};

/**
 * Validate the table invariants.
 * Call during tests or as a standalone check.
 */
export function validateTtlTable() {
  const violations = [];
  for (const [name, cfg] of Object.entries(SEED_TTL_TABLE)) {
    if (cfg.ttlSec < 2 * cfg.cronSec) {
      violations.push(`${name}: TTL ${cfg.ttlSec}s < 2× cron ${cfg.cronSec}s (${2 * cfg.cronSec}s)`);
    }
    if (cfg.maxStaleMin !== null && cfg.maxStaleMin < (cfg.cronSec * 2) / 60) {
      violations.push(`${name}: maxStaleMin ${cfg.maxStaleMin}min < 2× cron ${(cfg.cronSec * 2) / 60}min`);
    }
  }
  return violations;
}

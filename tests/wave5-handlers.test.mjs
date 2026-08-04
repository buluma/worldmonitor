/**
 * Wave-5 server handler and registration correctness tests.
 *
 * Tests:
 *   1. list-disease-outbreaks: empty fallback, REDIS_KEY, fallback methodology version
 *   2. list-air-quality-alerts: HEALTH_AIR_QUALITY_KEY, normalizer imports
 *   3. air-quality-stations: normalizeAirQualityStation guard logic
 *   4. handler.ts: exports both handlers
 *   5. api route: correct imports and export
 *   6. generated client: HealthServiceClient, listDiseaseOutbreaks, listAirQualityAlerts present
 *   7. generated server: HealthServiceHandler interface, createHealthServiceRoutes export
 *   8. disease-outbreaks service: uses HealthServiceClient, hydration bootstrap key
 *   9. Panel registration: all 5 touchpoints
 *   10. followed-countries stub: isFollowFeatureEnabled returns false
 *   11. en.json: mcp.diseaseOutbreaks keys present
 *   12. bootstrap.js: diseaseOutbreaks key registered
 *   13. cache-keys.ts: diseaseOutbreaks + HEALTH_AIR_QUALITY_KEY present
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf-8');
}

// ── 1. list-disease-outbreaks ────────────────────────────────────────────────
describe('list-disease-outbreaks handler', () => {
  const src = read('server/worldmonitor/health/v1/list-disease-outbreaks.ts');

  it('reads from health:disease-outbreaks:v1', () => {
    assert.match(src, /health:disease-outbreaks:v1/);
  });

  it('returns outbreaks array fallback on null cache', () => {
    assert.match(src, /outbreaks\s*:\s*data\?\.outbreaks\s*\?\?\s*\[\]/);
  });

  it('returns fetchedAt 0 fallback', () => {
    assert.match(src, /fetchedAt\s*:\s*data\?\.fetchedAt\s*\?\?\s*0/);
  });

  it('has alertLevelMethodologyVersion fallback', () => {
    assert.match(src, /alertLevelMethodologyVersion/);
    assert.match(src, /FALLBACK_METHODOLOGY_VERSION/);
    assert.match(src, /['"]v1['"]/);
  });

  it('uses getCachedJson with passthrough flag', () => {
    assert.match(src, /getCachedJson\(REDIS_KEY,\s*true\)/);
  });
});

// ── 2. list-air-quality-alerts ───────────────────────────────────────────────
describe('list-air-quality-alerts handler', () => {
  const src = read('server/worldmonitor/health/v1/list-air-quality-alerts.ts');

  it('imports HEALTH_AIR_QUALITY_KEY from cache-keys', () => {
    assert.match(src, /HEALTH_AIR_QUALITY_KEY.*cache-keys/s);
  });

  it('reads from HEALTH_AIR_QUALITY_KEY', () => {
    assert.match(src, /getCachedJson\(HEALTH_AIR_QUALITY_KEY,\s*true\)/);
  });

  it('imports normalizeAirQualityFetchedAt and normalizeAirQualityStations', () => {
    assert.match(src, /normalizeAirQualityFetchedAt/);
    assert.match(src, /normalizeAirQualityStations/);
  });

  it('prefers payload.stations then payload.alerts', () => {
    assert.match(src, /payload\?\.stations\s*\?\?\s*payload\?\.alerts/);
  });

  it('returns alerts and fetchedAt', () => {
    assert.match(src, /return\s*\{[\s\S]*alerts[\s\S]*fetchedAt[\s\S]*\}/m);
  });
});

// ── 3. air-quality-stations normalizer ──────────────────────────────────────
describe('air-quality-stations normalizer', () => {
  const src = read('server/_shared/air-quality-stations.ts');

  it('exports normalizeAirQualityStation', () => {
    assert.match(src, /export function normalizeAirQualityStation/);
  });

  it('exports normalizeAirQualityStations', () => {
    assert.match(src, /export function normalizeAirQualityStations/);
  });

  it('exports normalizeAirQualityFetchedAt', () => {
    assert.match(src, /export function normalizeAirQualityFetchedAt/);
  });

  it('requires city, lat, lng, pm25, aqi, measuredAt — returns null if missing', () => {
    assert.match(src, /if\s*\(!city\s*\|\|\s*lat\s*==\s*null/);
  });

  it('clamps aqi to 0..500', () => {
    assert.match(src, /Math\.max\(0,\s*Math\.min\(500/);
  });

  it('uses Number.isFinite guard', () => {
    assert.match(src, /Number\.isFinite/);
  });

  it('handles snake_case and camelCase keys', () => {
    assert.match(src, /measured_at.*measuredAt/s);
    assert.match(src, /country_code.*countryCode/s);
  });
});

// ── 4. health handler.ts ─────────────────────────────────────────────────────
describe('health handler.ts', () => {
  const src = read('server/worldmonitor/health/v1/handler.ts');

  it('exports healthHandler', () => {
    assert.match(src, /export const healthHandler/);
  });

  it('includes listAirQualityAlerts', () => {
    assert.match(src, /listAirQualityAlerts/);
  });

  it('includes listDiseaseOutbreaks', () => {
    assert.match(src, /listDiseaseOutbreaks/);
  });

  it('imports from list-air-quality-alerts', () => {
    assert.match(src, /from.*list-air-quality-alerts/);
  });

  it('imports from list-disease-outbreaks', () => {
    assert.match(src, /from.*list-disease-outbreaks/);
  });
});

// ── 5. api/health/v1/[rpc].ts ───────────────────────────────────────────────
describe('api/health/v1/[rpc].ts route', () => {
  const src = read('api/health/v1/[rpc].ts');

  it('sets runtime to edge', () => {
    assert.match(src, /runtime.*edge/);
  });

  it('imports createHealthServiceRoutes', () => {
    assert.match(src, /createHealthServiceRoutes/);
  });

  it('imports healthHandler', () => {
    assert.match(src, /healthHandler/);
  });

  it('uses createDomainGateway', () => {
    assert.match(src, /createDomainGateway/);
  });
});

// ── 6. generated client ──────────────────────────────────────────────────────
describe('generated health client', () => {
  const src = read('src/generated/client/worldmonitor/health/v1/service_client.ts');

  it('exports HealthServiceClient', () => {
    assert.match(src, /export.*HealthServiceClient/);
  });

  it('has listDiseaseOutbreaks method', () => {
    assert.match(src, /listDiseaseOutbreaks/);
  });

  it('has listAirQualityAlerts method', () => {
    assert.match(src, /listAirQualityAlerts/);
  });

  it('exports DiseaseOutbreakItem', () => {
    assert.match(src, /DiseaseOutbreakItem/);
  });
});

// ── 7. generated server ──────────────────────────────────────────────────────
describe('generated health server', () => {
  const src = read('src/generated/server/worldmonitor/health/v1/service_server.ts');

  it('exports createHealthServiceRoutes', () => {
    assert.match(src, /export.*createHealthServiceRoutes/);
  });

  it('has HealthServiceHandler interface', () => {
    assert.match(src, /HealthServiceHandler/);
  });

  it('has listDiseaseOutbreaks in handler interface', () => {
    assert.match(src, /listDiseaseOutbreaks/);
  });

  it('has listAirQualityAlerts in handler interface', () => {
    assert.match(src, /listAirQualityAlerts/);
  });
});

// ── 8. disease-outbreaks service ─────────────────────────────────────────────
describe('disease-outbreaks service', () => {
  const src = read('src/services/disease-outbreaks.ts');

  it('uses HealthServiceClient', () => {
    assert.match(src, /HealthServiceClient/);
  });

  it('calls getHydratedData with diseaseOutbreaks key', () => {
    assert.match(src, /getHydratedData\(['"]diseaseOutbreaks['"]\)/);
  });

  it('falls back to emptyOutbreaks', () => {
    assert.match(src, /emptyOutbreaks/);
  });

  it('returns outbreaks array', () => {
    assert.match(src, /outbreaks\s*:\s*\[\]/);
  });

  it('sets alertLevelMethodologyVersion fallback to v1', () => {
    assert.match(src, /alertLevelMethodologyVersion.*['"]v1['"]/s);
  });
});

// ── 9. panel registration — all 5 touchpoints ────────────────────────────────
describe('disease-outbreaks panel registration', () => {
  it('src/components/index.ts exports DiseaseOutbreaksPanel', () => {
    const src = read('src/components/index.ts');
    assert.match(src, /DiseaseOutbreaksPanel/);
  });

  it("src/config/panels.ts has 'disease-outbreaks' entry", () => {
    const src = read('src/config/panels.ts');
    assert.match(src, /'disease-outbreaks'/);
  });

  it('src/app/panel-layout.ts has lazyPanel for disease-outbreaks', () => {
    const src = read('src/app/panel-layout.ts');
    assert.match(src, /lazyPanel\(['"]disease-outbreaks['"]/);
  });

  it('src/config/variants/base.ts has diseaseOutbreaks refresh interval', () => {
    const src = read('src/config/variants/base.ts');
    assert.match(src, /diseaseOutbreaks\s*:/);
  });

  it('src/app/data-loader.ts imports fetchDiseaseOutbreaks', () => {
    const src = read('src/app/data-loader.ts');
    assert.match(src, /fetchDiseaseOutbreaks/);
  });

  it('src/app/data-loader.ts has loadDiseaseOutbreaks method', () => {
    const src = read('src/app/data-loader.ts');
    assert.match(src, /loadDiseaseOutbreaks/);
  });
});

// ── 10. followed-countries stub ───────────────────────────────────────────────
describe('followed-countries stub', () => {
  const src = read('src/services/followed-countries.ts');

  it('exports isFollowFeatureEnabled returning false', () => {
    assert.match(src, /isFollowFeatureEnabled/);
    assert.match(src, /return false/);
  });

  it('exports isFollowed', () => {
    assert.match(src, /export function isFollowed/);
  });

  it('exports subscribe', () => {
    assert.match(src, /export function subscribe/);
  });

  it('exports getFollowed returning empty array', () => {
    assert.match(src, /return \[\]/);
  });

  it('has no import of convex or clerk', () => {
    assert.doesNotMatch(src, /^import.*(?:convex|@clerk)/im);
  });
});

// ── 11. en.json i18n keys ────────────────────────────────────────────────────
describe('en.json disease-outbreaks i18n', () => {
  const obj = JSON.parse(read('src/locales/en.json'));

  it('has mcp.diseaseOutbreaks.infoTooltip', () => {
    assert.ok(obj.mcp?.diseaseOutbreaks?.infoTooltip, 'mcp.diseaseOutbreaks.infoTooltip missing');
  });

  it('has mcp.diseaseOutbreaks.levels.alert', () => {
    assert.ok(obj.mcp?.diseaseOutbreaks?.levels?.alert, 'levels.alert missing');
  });

  it('has mcp.diseaseOutbreaks.levels.warning', () => {
    assert.ok(obj.mcp?.diseaseOutbreaks?.levels?.warning, 'levels.warning missing');
  });

  it('has mcp.diseaseOutbreaks.levels.watch', () => {
    assert.ok(obj.mcp?.diseaseOutbreaks?.levels?.watch, 'levels.watch missing');
  });

  it('has mcp.diseaseOutbreaks.time.justNow', () => {
    assert.ok(obj.mcp?.diseaseOutbreaks?.time?.justNow, 'time.justNow missing');
  });

  it('has mcp.diseaseOutbreaks.filters.alert_one', () => {
    assert.ok(obj.mcp?.diseaseOutbreaks?.filters?.alert_one, 'filters.alert_one missing');
  });

  it('has mcp.diseaseOutbreaks.errors.noData', () => {
    assert.ok(obj.mcp?.diseaseOutbreaks?.errors?.noData, 'errors.noData missing');
  });

  it('has panels.diseaseOutbreaks name', () => {
    assert.ok(obj.panels?.diseaseOutbreaks, 'panels.diseaseOutbreaks missing');
  });
});

// ── 12. bootstrap.js registration ────────────────────────────────────────────
describe('bootstrap.js diseaseOutbreaks', () => {
  const src = read('api/bootstrap.js');

  it('BOOTSTRAP_CACHE_KEYS has diseaseOutbreaks', () => {
    assert.match(src, /diseaseOutbreaks\s*:\s*['"]health:disease-outbreaks:v1['"]/);
  });

  it('SLOW_KEYS set includes diseaseOutbreaks (bootstrap.js encodes tiers as SLOW_KEYS/FAST_KEYS sets, not a per-key tier map)', () => {
    const slow = src.match(/(?:const|var)\s+SLOW_KEYS[\s\S]*?\]\);/)?.[0] ?? '';
    assert.match(slow, /['"]diseaseOutbreaks['"]/);
  });
});

// ── 13. cache-keys.ts ────────────────────────────────────────────────────────
describe('server/_shared/cache-keys.ts', () => {
  const src = read('server/_shared/cache-keys.ts');

  it('has diseaseOutbreaks key mapping', () => {
    assert.match(src, /diseaseOutbreaks\s*:\s*['"]health:disease-outbreaks:v1['"]/);
  });

  it('exports HEALTH_AIR_QUALITY_KEY', () => {
    assert.match(src, /export const HEALTH_AIR_QUALITY_KEY/);
    assert.match(src, /health:air-quality:v1/);
  });
});

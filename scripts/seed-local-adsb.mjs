#!/usr/bin/env node

/**
 * Local ADS-B seeder — polls a readsb/dump1090 feeder on the local network
 * and writes aircraft positions to Redis for the worldmonitor map.
 *
 * Env:
 *   ADSB_FEEDER_URL  — e.g. http://10.0.0.190:8080/data/aircraft.json
 *   ADSB_FEEDER_LAT  — feeder latitude (for coverage ring)
 *   ADSB_FEEDER_LON  — feeder longitude
 *   ADSB_FEEDER_RANGE_NM — max receiver range in nautical miles (default 300)
 */

import { loadEnvFile, runSeed } from './_seed-utils.mjs';

loadEnvFile(import.meta.url);

const FEEDER_URL = process.env.ADSB_FEEDER_URL;
const FEEDER_LAT = Number(process.env.ADSB_FEEDER_LAT || '-1.37139');
const FEEDER_LON = Number(process.env.ADSB_FEEDER_LON || '36.66347');
const FEEDER_RANGE_NM = Number(process.env.ADSB_FEEDER_RANGE_NM || '300');
const KEY = 'adsb:local:v1';
const TTL = 150;

if (!FEEDER_URL) {
  console.warn('[local-adsb] ADSB_FEEDER_URL not set — skipping');
  process.exit(0);
}

const statsUrl = FEEDER_URL.replace('/data/aircraft.json', '/data/stats.json');

async function fetchData() {
  const [aircraftResp, statsResp] = await Promise.all([
    fetch(FEEDER_URL, { signal: AbortSignal.timeout(10_000) }),
    fetch(statsUrl, { signal: AbortSignal.timeout(5_000) }).catch(() => null),
  ]);

  if (!aircraftResp.ok) throw new Error(`Feeder HTTP ${aircraftResp.status}`);
  const data = await aircraftResp.json();
  const raw = data.aircraft || [];

  const aircraft = raw
    .filter(a => a.lat != null && a.lon != null && (a.seen ?? 999) < 58)
    .map(a => ({
      hex: a.hex || '',
      callsign: (a.flight || '').trim(),
      lat: a.lat,
      lon: a.lon,
      altBaro: a.alt_baro ?? null,
      altGeom: a.alt_geom ?? null,
      gs: a.gs ?? null,
      track: a.track ?? null,
      vertRate: a.baro_rate ?? a.geom_rate ?? null,
      squawk: a.squawk ?? null,
      category: a.category ?? null,
      type: a.t ?? a.desc ?? null,
      registration: a.r ?? null,
      onGround: a.alt_baro === 'ground',
      rssi: a.rssi ?? null,
      seen: a.seen ?? 0,
      messages: a.messages ?? 0,
    }));

  let stats = null;
  if (statsResp?.ok) {
    try {
      const sd = await statsResp.json();
      const l = (sd.last1min || {}).local || {};
      const t = (sd.total || {}).local || {};
      stats = {
        gainDb: sd.gain_db ?? 0,
        noise: l.noise ?? 0,
        signal: l.signal ?? 0,
        peakSignal: l.peak_signal ?? 0,
        messages1m: Array.isArray(l.accepted) ? l.accepted.reduce((a, b) => a + b, 0) : 0,
        messagesTotal: Array.isArray(t.accepted) ? t.accepted.reduce((a, b) => a + b, 0) : 0,
        maxRangeNm: (sd.total || {}).max_distance_in_nautical_miles ?? 0,
        tracksTotal: ((sd.total || {}).tracks || {}).all ?? 0,
      };
    } catch {}
  }

  console.log(`  Aircraft: ${aircraft.length}/${raw.length} with position (stale filtered)`);
  if (aircraft.length > 0) {
    for (const a of aircraft.slice(0, 5)) {
      console.log(`  ${a.hex} ${(a.callsign || '?').padEnd(8)} alt=${a.altBaro ?? '?'} gs=${a.gs ?? '?'}`);
    }
    if (aircraft.length > 5) console.log(`  ... and ${aircraft.length - 5} more`);
  }

  return {
    aircraft,
    total: raw.length,
    withPosition: aircraft.length,
    feeder: {
      lat: FEEDER_LAT,
      lon: FEEDER_LON,
      rangeNm: FEEDER_RANGE_NM,
    },
    stats,
    now: data.now || Date.now() / 1000,
    fetchedAt: new Date().toISOString(),
  };
}

await runSeed('adsb', 'local', KEY, fetchData, {
  ttlSeconds: TTL,
  lockTtlMs: 55_000,
  validateFn: data => Array.isArray(data?.aircraft),
  recordCount: data => data.withPosition,
});

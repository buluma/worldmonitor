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

import { loadEnvFile, getRedisCredentials, redisSet } from './_seed-utils.mjs';

loadEnvFile(import.meta.url);

const FEEDER_URL = process.env.ADSB_FEEDER_URL;
const FEEDER_LAT = Number(process.env.ADSB_FEEDER_LAT || '-1.37139');
const FEEDER_LON = Number(process.env.ADSB_FEEDER_LON || '36.66347');
const FEEDER_RANGE_NM = Number(process.env.ADSB_FEEDER_RANGE_NM || '300');
const KEY = 'adsb:local:v1';
const TTL = 120;

if (!FEEDER_URL) {
  console.warn('[local-adsb] ADSB_FEEDER_URL not set — skipping');
  process.exit(0);
}

async function fetchAircraft() {
  const resp = await fetch(FEEDER_URL, { signal: AbortSignal.timeout(10_000) });
  if (!resp.ok) throw new Error(`Feeder HTTP ${resp.status}`);
  const data = await resp.json();
  const raw = data.aircraft || [];

  const aircraft = raw
    .filter(a => a.lat != null && a.lon != null)
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

  return {
    aircraft,
    total: raw.length,
    withPosition: aircraft.length,
    feeder: {
      lat: FEEDER_LAT,
      lon: FEEDER_LON,
      rangeNm: FEEDER_RANGE_NM,
    },
    now: data.now || Date.now() / 1000,
    fetchedAt: new Date().toISOString(),
  };
}

async function run() {
  console.log(`[local-adsb] Fetching from ${FEEDER_URL}...`);
  const data = await fetchAircraft();
  console.log(`  Aircraft: ${data.withPosition}/${data.total} with position`);

  if (data.withPosition > 0) {
    for (const a of data.aircraft.slice(0, 5)) {
      console.log(`  ${a.hex} ${(a.callsign || '?').padEnd(8)} alt=${a.altBaro ?? '?'} gs=${a.gs ?? '?'}`);
    }
    if (data.aircraft.length > 5) console.log(`  ... and ${data.aircraft.length - 5} more`);
  }

  const { url, token } = getRedisCredentials();
  await redisSet(url, token, KEY, data, TTL);
  console.log(`[local-adsb] Written to ${KEY} (TTL ${TTL}s)`);
}

run().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Seed internet disruption data from Cloudflare Radar to Redis.
 *
 * Keys written:
 *   cf:radar:ddos:v1          — DDoS attack vectors/protocols + top targets
 *   cf:radar:traffic-anomalies:v1 — traffic anomaly events
 *
 * Requires: CF_RADAR_API_TOKEN (Cloudflare API token with radar:read)
 * TTL: 6h
 */

import { loadEnvFile, CHROME_UA, writeExtraKeyWithMeta } from './_seed-utils.mjs';

loadEnvFile(import.meta.url);

const DDOS_KEY = 'cf:radar:ddos:v1';
const ANOMALIES_KEY = 'cf:radar:traffic-anomalies:v1';
const TTL = 21_600; // 6h

const CF_TOKEN = process.env.CF_RADAR_API_TOKEN?.trim();
const CF_BASE = 'https://api.cloudflare.com/client/v4/radar';

async function cfGet(path) {
  const resp = await fetch(`${CF_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      Accept: 'application/json',
      'User-Agent': CHROME_UA,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`CF Radar ${path}: HTTP ${resp.status}`);
  const json = await resp.json();
  if (!json.success) throw new Error(`CF Radar ${path}: API error ${JSON.stringify(json.errors)}`);
  return json.result;
}

function now7d() {
  const end = new Date();
  const start = new Date(Date.now() - 7 * 86400_000);
  return { dateStart: start.toISOString(), dateEnd: end.toISOString() };
}

async function seedDdos() {
  if (!CF_TOKEN) {
    console.warn('  CF_RADAR_API_TOKEN not set, writing empty DDoS data');
    await writeExtraKeyWithMeta(DDOS_KEY, { protocol: [], vector: [], dateRangeStart: '', dateRangeEnd: '', topTargetLocations: [] }, TTL, 0);
    return;
  }

  const { dateStart, dateEnd } = now7d();
  const qs = `dateStart=${encodeURIComponent(dateStart)}&dateEnd=${encodeURIComponent(dateEnd)}`;

  let protocol = [];
  let vector = [];
  let topTargetLocations = [];

  try {
    const proto = await cfGet(`/attacks/layer3/summary/protocol?${qs}`);
    const protocolSeries = proto?.summary_0 || {};
    protocol = Object.entries(protocolSeries)
      .map(([label, pct]) => ({ label, percentage: typeof pct === 'number' ? pct : parseFloat(pct) || 0 }))
      .filter(e => e.percentage > 0)
      .sort((a, b) => b.percentage - a.percentage);
    console.log(`  DDoS protocols: ${protocol.length}`);
  } catch (e) { console.warn(`  DDoS protocol fetch: ${e.message}`); }

  try {
    const vec = await cfGet(`/attacks/layer3/summary/vector?${qs}`);
    const vectorSeries = vec?.summary_0 || {};
    vector = Object.entries(vectorSeries)
      .map(([label, pct]) => ({ label, percentage: typeof pct === 'number' ? pct : parseFloat(pct) || 0 }))
      .filter(e => e.percentage > 0)
      .sort((a, b) => b.percentage - a.percentage);
    console.log(`  DDoS vectors: ${vector.length}`);
  } catch (e) { console.warn(`  DDoS vector fetch: ${e.message}`); }

  try {
    const tgt = await cfGet(`/attacks/layer3/top/locations/target?${qs}&limit=10`);
    const locs = tgt?.top_0 || [];
    topTargetLocations = locs.map(l => ({
      countryCode: l.countryAlpha2 || l.clientCountryAlpha2 || '',
      countryName: l.country || l.clientCountry || '',
      percentage: typeof l.value === 'number' ? l.value : parseFloat(l.value) || 0,
      latitude: 0,
      longitude: 0,
    }));
    console.log(`  DDoS top targets: ${topTargetLocations.length}`);
  } catch (e) { console.warn(`  DDoS targets fetch: ${e.message}`); }

  const payload = { protocol, vector, dateRangeStart: dateStart, dateRangeEnd: dateEnd, topTargetLocations };
  await writeExtraKeyWithMeta(DDOS_KEY, payload, TTL, protocol.length + vector.length);
}

async function seedAnomalies() {
  if (!CF_TOKEN) {
    console.warn('  CF_RADAR_API_TOKEN not set, writing empty anomaly data');
    await writeExtraKeyWithMeta(ANOMALIES_KEY, { anomalies: [], totalCount: 0 }, TTL, 0);
    return;
  }

  let anomalies = [];
  try {
    const { dateStart, dateEnd } = now7d();
    const result = await cfGet(`/traffic-anomalies/?dateStart=${encodeURIComponent(dateStart)}&dateEnd=${encodeURIComponent(dateEnd)}&status=ANOMALY_STATUS_ONGOING&limit=100`);
    const items = result?.trafficAnomalies || [];
    anomalies = items.map(a => ({
      uuid: a.uuid || '',
      type: a.type || '',
      status: a.status || '',
      startDate: a.startDate ? new Date(a.startDate).getTime() : 0,
      endDate: a.endDate ? new Date(a.endDate).getTime() : 0,
      asn: String(a.details?.locations?.[0]?.asns?.[0] || ''),
      asnName: a.details?.locations?.[0]?.asnName || '',
      locationCode: a.details?.locations?.[0]?.locationAlpha2 || '',
      locationName: a.details?.locations?.[0]?.locationName || '',
      latitude: 0,
      longitude: 0,
    }));
    console.log(`  Traffic anomalies: ${anomalies.length}`);
  } catch (e) { console.warn(`  Traffic anomalies fetch: ${e.message}`); }

  await writeExtraKeyWithMeta(ANOMALIES_KEY, { anomalies, totalCount: anomalies.length }, TTL, anomalies.length);
}

async function main() {
  await Promise.all([seedDdos(), seedAnomalies()]);
  console.log('internet disruptions seed complete');
}

main().catch(e => { console.error(e.message); process.exit(1); });

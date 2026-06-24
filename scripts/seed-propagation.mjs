#!/usr/bin/env node

/**
 * HF Propagation seeder — fetches solar/ionospheric data from hamqsl.com.
 * Writes band conditions, solar flux, K-index for the HF Propagation panel.
 */

import { loadEnvFile, getRedisCredentials, redisSet } from './_seed-utils.mjs';

loadEnvFile(import.meta.url);

const KEY = 'rf:propagation:v1';
const TTL = 1800;
const SOURCE_URL = 'https://www.hamqsl.com/solarxml.php';

function parseXmlTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return match ? match[1].trim() : '';
}

function parseBandConditions(xml) {
  const bands = {};
  const dayRegex = /<band name="([^"]+)" time="day">([^<]+)<\/band>/g;
  const nightRegex = /<band name="([^"]+)" time="night">([^<]+)<\/band>/g;
  let m;
  while ((m = dayRegex.exec(xml)) !== null) {
    if (!bands[m[1]]) bands[m[1]] = {};
    bands[m[1]].day = m[2].trim();
  }
  while ((m = nightRegex.exec(xml)) !== null) {
    if (!bands[m[1]]) bands[m[1]] = {};
    bands[m[1]].night = m[2].trim();
  }
  return bands;
}

async function fetchPropagation() {
  const resp = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(10_000) });
  if (!resp.ok) throw new Error(`hamqsl HTTP ${resp.status}`);
  const xml = await resp.text();

  const solarFlux = parseXmlTag(xml, 'solarflux');
  const sunspots = parseXmlTag(xml, 'sunspots');
  const aIndex = parseXmlTag(xml, 'aindex');
  const kIndex = parseXmlTag(xml, 'kindex');
  const xray = parseXmlTag(xml, 'xray');
  const heliumLine = parseXmlTag(xml, 'heliumline');
  const protonFlux = parseXmlTag(xml, 'protonflux');
  const electonFlux = parseXmlTag(xml, 'electonflux');
  const aurora = parseXmlTag(xml, 'aurora');
  const solarWind = parseXmlTag(xml, 'solarwind');
  const magneticField = parseXmlTag(xml, 'magneticfield');
  const signalNoise = parseXmlTag(xml, 'signalnoise');
  const geomagField = parseXmlTag(xml, 'geomagfield');
  const updated = parseXmlTag(xml, 'updated');

  const bands = parseBandConditions(xml);

  return {
    solarFlux: Number(solarFlux) || 0,
    sunspots: Number(sunspots) || 0,
    aIndex: Number(aIndex) || 0,
    kIndex: Number(kIndex) || 0,
    xray,
    heliumLine,
    protonFlux,
    electonFlux,
    aurora: Number(aurora) || 0,
    solarWind: Number(solarWind) || 0,
    magneticField: Number(magneticField) || 0,
    signalNoise,
    geomagField,
    bands,
    updated,
    fetchedAt: new Date().toISOString(),
  };
}

async function run() {
  console.log('[propagation] Fetching HF propagation data from hamqsl.com...');
  const data = await fetchPropagation();
  console.log(`  Solar flux: ${data.solarFlux}, K-index: ${data.kIndex}, A-index: ${data.aIndex}`);
  console.log(`  Bands: ${Object.keys(data.bands).join(', ')}`);

  const { url, token } = getRedisCredentials();
  await redisSet(url, token, KEY, data, TTL);
  console.log(`[propagation] Written to ${KEY} (TTL ${TTL}s)`);
}

run().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});

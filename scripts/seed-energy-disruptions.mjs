#!/usr/bin/env node
/**
 * Seed energy disruption events to Redis via LLM classification of news digest.
 *
 * Key written:
 *   energy:disruptions:v1 — EnergyDisruptionEntry records keyed by id
 *
 * Flow:
 *   1. Read news:digest:v1:full:en from Redis
 *   2. Ask Groq (llama-3.1-8b-instant) to extract energy disruption events
 *   3. Merge with base static events (Nord Stream, Ukraine transit, Kirkuk-Ceyhan)
 *   4. Write to Redis with 8h TTL
 *
 * Falls back to static-only on LLM unavailability.
 */

import { loadEnvFile, CHROME_UA, getRedisCredentials, writeExtraKeyWithMeta, redisGet } from './_seed-utils.mjs';

loadEnvFile(import.meta.url);

const REDIS_KEY = 'energy:disruptions:v1';
const DIGEST_KEY = 'news:digest:v1:full:en';
const TTL = 28_800; // 8h
const GROQ_MODEL = 'llama-3.1-8b-instant';
const TODAY = new Date().toISOString().slice(0, 10);

// ─── Static baseline disruptions ─────────────────────────────────────────────

const BASE_DISRUPTIONS = {
  'nordstream2-sabotage': {
    id: 'nordstream2-sabotage',
    assetId: 'nordstream2',
    assetType: 'pipeline',
    eventType: 'sabotage',
    startAt: '2022-09-26',
    endAt: '',
    capacityOfflineBcmYr: 55,
    capacityOfflineMbd: 0,
    causeChain: ['underwater-explosion', 'sabotage'],
    shortDescription: 'Nord Stream 2 pipeline destroyed by underwater explosions. 55 bcm/yr capacity permanently offline.',
    sources: [
      { authority: 'Reuters', title: 'Explosions damage Nord Stream pipelines', url: 'https://www.reuters.com', date: '2022-09-26', sourceType: 'press' },
      { authority: 'Swedish Accident Investigation Authority', title: 'Investigation conclusions', url: 'https://www.havkom.se', date: '2024-02-07', sourceType: 'regulator' },
    ],
    classifierVersion: 'curated-v1',
    classifierConfidence: 0.99,
    lastEvidenceUpdate: '2024-06-01',
    countries: ['Russia', 'Germany', 'Sweden'],
  },
  'ukraine-transit-expiry': {
    id: 'ukraine-transit-expiry',
    assetId: 'ukraine-transit',
    assetType: 'pipeline',
    eventType: 'contract-expiry',
    startAt: '2025-01-01',
    endAt: '',
    capacityOfflineBcmYr: 14,
    capacityOfflineMbd: 0,
    causeChain: ['contract-expiry', 'sanctions-policy', 'war'],
    shortDescription: 'Ukraine-Russia gas transit agreement expired January 2025. Ukraine refused renewal citing war. Slovakia, Austria affected.',
    sources: [
      { authority: 'Naftogaz', title: 'Transit agreement statement', url: 'https://naftogaz.com', date: '2025-01-01', sourceType: 'operator' },
      { authority: 'IEA', title: 'Gas Market Report Q1 2025', url: 'https://www.iea.org', date: '2025-01-15', sourceType: 'regulator' },
    ],
    classifierVersion: 'curated-v1',
    classifierConfidence: 0.98,
    lastEvidenceUpdate: '2025-06-01',
    countries: ['Ukraine', 'Russia', 'Slovakia', 'Austria', 'Hungary'],
  },
  'kirkuk-ceyhan-icc': {
    id: 'kirkuk-ceyhan-icc',
    assetId: 'kirkuk-ceyhan',
    assetType: 'pipeline',
    eventType: 'legal-dispute',
    startAt: '2023-03-25',
    endAt: '',
    capacityOfflineBcmYr: 0,
    capacityOfflineMbd: 0.45,
    causeChain: ['icc-ruling', 'political-dispute', 'sovereignty'],
    shortDescription: 'Kirkuk-Ceyhan pipeline shutdown following ICC ruling. Turkey must pay $1.5bn to Iraq for unauthorized Kurdish exports. No restart agreed.',
    sources: [
      { authority: 'ICC', title: 'Iraqi-Turkey Pipeline Arbitration Award', url: 'https://iccwbo.org', date: '2023-03-25', sourceType: 'regulator' },
      { authority: 'Reuters', title: 'Iraq-Turkey oil pipeline', url: 'https://www.reuters.com', date: '2024-06-01', sourceType: 'press' },
    ],
    classifierVersion: 'curated-v1',
    classifierConfidence: 0.96,
    lastEvidenceUpdate: TODAY,
    countries: ['Iraq', 'Turkey', 'Kurdistan Region'],
  },
  'druzhba-north-halt': {
    id: 'druzhba-north-halt',
    assetId: 'druzhba',
    assetType: 'pipeline',
    eventType: 'sanctions',
    startAt: '2022-02-24',
    endAt: '',
    capacityOfflineBcmYr: 0,
    capacityOfflineMbd: 0.7,
    causeChain: ['sanctions', 'war', 'eu-embargo'],
    shortDescription: 'Northern Druzhba route (Poland/Germany) halted by EU embargo on Russian oil. Southern route continues under Hungarian/Slovak exemption.',
    sources: [
      { authority: 'EU Council', title: 'Council Regulation (EU) 2022/879', url: 'https://eur-lex.europa.eu', date: '2022-06-03', sourceType: 'regulator' },
    ],
    classifierVersion: 'curated-v1',
    classifierConfidence: 0.97,
    lastEvidenceUpdate: TODAY,
    countries: ['Russia', 'Poland', 'Germany'],
  },
  'hormuz-restriction-2026': {
    id: 'hormuz-restriction-2026',
    assetId: 'hormuz-strait',
    assetType: 'chokepoint',
    eventType: 'military-restriction',
    startAt: '2026-02-23',
    endAt: '',
    capacityOfflineBcmYr: 0,
    capacityOfflineMbd: 4.5,
    causeChain: ['iran-escalation', 'military-restriction', 'tanker-harassment'],
    shortDescription: 'Iran-linked forces enforcing vessel screening in Strait of Hormuz following escalation. 4.5 mb/d effective flow reduction; UAE/Saudi bypass routes activated.',
    sources: [
      { authority: 'US EIA', title: 'Strait of Hormuz oil flows disrupted', url: 'https://www.eia.gov', date: '2026-02-24', sourceType: 'regulator' },
      { authority: 'Reuters', title: 'Hormuz disruption impacts oil markets', url: 'https://www.reuters.com', date: '2026-02-25', sourceType: 'press' },
    ],
    classifierVersion: 'curated-v1',
    classifierConfidence: 0.94,
    lastEvidenceUpdate: TODAY,
    countries: ['Iran', 'UAE', 'Saudi Arabia', 'Kuwait', 'Qatar', 'Iraq'],
  },
};

// ─── Groq LLM extraction ──────────────────────────────────────────────────────

async function extractDisruptionsFromDigest(headlines) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    console.log('  GROQ_API_KEY not set — skipping LLM extraction');
    return [];
  }

  const headlineText = headlines
    .filter(h => h?.title)
    .slice(0, 40)
    .map(h => `- ${h.title}`)
    .join('\n');

  if (!headlineText) return [];

  const systemPrompt = `You are an energy intelligence analyst. Extract energy disruption events from headlines.
Output JSON array only. Each event:
{
  "id": "kebab-case-id",
  "assetId": "pipeline/facility/chokepoint identifier",
  "assetType": "pipeline|storage-facility|chokepoint|refinery|power-plant",
  "eventType": "sabotage|sanctions|weather|accident|strike|legal-dispute|war-damage|military-restriction|contract-expiry",
  "startAt": "YYYY-MM-DD",
  "endAt": "YYYY-MM-DD or empty if ongoing",
  "capacityOfflineBcmYr": 0,
  "capacityOfflineMbd": 0,
  "causeChain": ["cause1", "cause2"],
  "shortDescription": "One-sentence factual description",
  "sources": [],
  "classifierVersion": "llm-extracted-v1",
  "classifierConfidence": 0.7,
  "lastEvidenceUpdate": "${TODAY}",
  "countries": ["country1"]
}
Return [] if no energy disruption events found. Do not hallucinate events not in headlines.`;

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': CHROME_UA },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Headlines:\n${headlineText}\n\nReturn JSON array of energy disruption events only.` },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!resp.ok) {
      console.warn(`  Groq API error: ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content?.trim() ?? '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const events = JSON.parse(jsonMatch[0]);
    return Array.isArray(events) ? events.filter(e => e.id && e.assetType && e.eventType) : [];
  } catch (e) {
    console.warn(`  Groq extraction failed: ${e.message}`);
    return [];
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { url, token } = getRedisCredentials();

  let llmEvents = [];
  try {
    const digest = await redisGet(url, token, DIGEST_KEY);
    const headlines = Array.isArray(digest?.items) ? digest.items : [];
    console.log(`  digest: ${headlines.length} headlines`);
    if (headlines.length > 0) {
      llmEvents = await extractDisruptionsFromDigest(headlines);
      console.log(`  LLM extracted: ${llmEvents.length} disruption events`);
    }
  } catch (e) {
    console.warn(`  digest read failed: ${e.message}`);
  }

  const events = { ...BASE_DISRUPTIONS };
  for (const ev of llmEvents) {
    if (ev.id && !events[ev.id]) {
      events[ev.id] = ev;
    }
  }

  const registry = {
    events,
    classifierVersion: 'curated-v1',
    fetchedAt: new Date().toISOString(),
  };

  await writeExtraKeyWithMeta(REDIS_KEY, registry, TTL, Object.keys(events).length);
  console.log(`  disruptions: ${Object.keys(events).length} total (${Object.keys(BASE_DISRUPTIONS).length} static + ${llmEvents.length} LLM)`);
  console.log('energy disruptions seed complete');
}

main().catch(e => { console.error(e.message); process.exit(1); });

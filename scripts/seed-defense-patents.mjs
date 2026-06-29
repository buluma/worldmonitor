#!/usr/bin/env node
/**
 * Seed defense and dual-use patent filings to Redis.
 *
 * Key written:
 *   patents:defense:latest
 *
 * Source: USPTO PatentsView API (free, no auth required)
 * CPC codes: H04B (comms), H01L (semiconductors), F42B (ammunition), G06N (AI/ML), C12N (biotech)
 * Assignees: defense primes + dual-use tech companies
 *
 * TTL: 7 days (data updates weekly)
 */

import { loadEnvFile, CHROME_UA, writeExtraKeyWithMeta } from './_seed-utils.mjs';

loadEnvFile(import.meta.url);

const REDIS_KEY = 'patents:defense:latest';
const TTL = 7 * 86400; // 7 days

const CPC_CODES = ['H04B', 'H01L', 'F42B', 'G06N', 'C12N'];
const CPC_DESCS = {
  H04B: 'Transmission / Communications Hardware',
  H01L: 'Semiconductors / Microelectronics',
  F42B: 'Ammunition / Ordnance',
  G06N: 'AI / Machine Learning',
  C12N: 'Microbiology / Biotech',
};

const TARGET_ASSIGNEES = [
  'Raytheon', 'Lockheed', 'Northrop', 'Boeing', 'General Dynamics',
  'L3Harris', 'Leidos', 'SAIC', 'BAE Systems', 'Thales',
  'Huawei', 'Ericsson', 'Nokia', 'Samsung', 'DARPA', 'IARPA',
  'Palantir', 'Anduril', 'Shield AI', 'SpaceX',
];

const PATENTSVIEW_BASE = 'https://search.patentsview.org/api/v1';

async function fetchCpcPatents(cpcCode) {
  const query = {
    q: {
      _and: [
        { _prefix: { 'cpc_at_issue.cpc_section_id': cpcCode } },
        { _gte: { grant_date: new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10) } },
      ],
    },
    f: ['patent_id', 'patent_title', 'grant_date', 'patent_abstract', 'assignee_organization', 'cpc_at_issue'],
    o: { sort: [{ grant_date: 'desc' }], size: 25, offset: 0 },
  };

  const resp = await fetch(`${PATENTSVIEW_BASE}/patent/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': CHROME_UA, Accept: 'application/json' },
    body: JSON.stringify(query),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`PatentsView ${cpcCode}: HTTP ${resp.status}`);
  const data = await resp.json();
  return (data.patents || []).map(p => {
    const assignee = (p.assignees || []).map(a => a.assignee_organization).filter(Boolean).join('; ') || 'Unknown';
    const cpc = (p.cpcs || [])[0];
    return {
      patentId: p.patent_id || '',
      title: p.patent_title || '',
      date: p.grant_date || '',
      assignee,
      cpcCode,
      cpcDesc: CPC_DESCS[cpcCode] || cpcCode,
      abstract: (p.patent_abstract || '').slice(0, 400),
      url: p.patent_id ? `https://patents.google.com/patent/US${p.patent_id}` : '',
    };
  });
}

async function main() {
  const results = await Promise.allSettled(CPC_CODES.map(async (code) => {
    try {
      const patents = await fetchCpcPatents(code);
      console.log(`  CPC ${code}: ${patents.length} patents`);
      return patents;
    } catch (e) {
      console.warn(`  CPC ${code}: ${e.message}`);
      return [];
    }
  }));

  const seenIds = new Set();
  const allPatents = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const p of r.value) {
      if (!p.patentId || seenIds.has(p.patentId)) continue;
      seenIds.add(p.patentId);
      allPatents.push(p);
    }
  }

  // Filter for defense-relevant assignees (best-effort — many public patents are fine too)
  const isRelevant = (p) =>
    !TARGET_ASSIGNEES.length ||
    TARGET_ASSIGNEES.some(a => p.assignee.toLowerCase().includes(a.toLowerCase())) ||
    p.cpcCode === 'F42B'; // ordnance always relevant

  const filtered = allPatents.filter(isRelevant);
  const patents = filtered.length >= 20 ? filtered : allPatents; // fallback: all if too few match
  patents.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));

  const fetchedAt = new Date().toISOString();
  const payload = { patents, fetchedAt };
  await writeExtraKeyWithMeta(REDIS_KEY, payload, TTL, patents.length);
  console.log(`  defense-patents: ${patents.length} filings across ${CPC_CODES.join(', ')}`);
  console.log('defense patents seed complete');
}

main().catch(e => { console.error(e.message); process.exit(1); });

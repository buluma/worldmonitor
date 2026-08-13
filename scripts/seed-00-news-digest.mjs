#!/usr/bin/env node

/**
 * Lightweight news digest seeder for self-hosted deployments.
 * Fetches top RSS feeds, builds a digest, and writes to Redis so
 * seed-insights.mjs can consume it.
 */

import crypto from 'node:crypto';
import { loadEnvFile, CHROME_UA, getRedisCredentials, redisSet, redisCommand } from './_seed-utils.mjs';
import { classifyByKeyword } from './shared/news-classifier.mjs';

loadEnvFile(import.meta.url);

// Matches ais-relay.cjs's classifyCacheKey() exactly — that's the daemon
// that actually calls an LLM to upgrade keyword-classified headlines. Read
// its cache here so items get their real llm-sourced threat tag instead of
// only ever the keyword fallback.
function classifyCacheKey(title) {
  const hash = crypto.createHash('sha256').update(title.toLowerCase()).digest('hex').slice(0, 16);
  return `classify:sebuf:v1:${hash}`;
}

const DIGEST_KEY = 'news:digest:v1:full:en';
const DIGEST_TTL = 1800;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_ITEMS_PER_FEED = 15;

const FEEDS = {
  politics: [
    { name: 'Reuters World', url: 'https://feeds.reuters.com/Reuters/worldNews' },
    { name: 'AP News', url: 'https://feeds.apnews.com/rss/apf-topnews' },
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { name: 'DW News', url: 'https://rss.dw.com/rdf/rss-en-all' },
    { name: 'France24', url: 'https://www.france24.com/en/rss' },
    { name: 'BBC Africa', url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml' },
    { name: 'BBC Latin America', url: 'https://feeds.bbci.co.uk/news/world/latin_america/rss.xml' },
  ],
  conflict: [
    { name: 'BBC Middle East', url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml' },
    { name: 'BBC Asia', url: 'https://feeds.bbci.co.uk/news/world/asia/rss.xml' },
    { name: 'BBC Europe', url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml' },
    { name: 'Arms Control', url: 'https://www.armscontrol.org/rss' },
    { name: 'ICG', url: 'https://www.crisisgroup.org/rss.xml' },
    { name: 'ReliefWeb', url: 'https://reliefweb.int/updates/rss.xml' },
    { name: 'UNHCR', url: 'https://www.unhcr.org/rss/news.xml' },
  ],
  finance: [
    { name: 'Reuters Business', url: 'https://feeds.reuters.com/reuters/businessNews' },
    { name: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
    { name: 'FT', url: 'https://www.ft.com/?format=rss' },
    { name: 'OilPrice', url: 'https://oilprice.com/rss/main' },
    { name: 'S&P Global', url: 'https://www.spglobal.com/commodityinsights/en/rss-feed/all' },
  ],
  tech: [
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
    { name: 'Wired', url: 'https://www.wired.com/feed/rss' },
  ],
  intel: [
    { name: 'Bellingcat', url: 'https://www.bellingcat.com/feed/' },
    { name: 'War on the Rocks', url: 'https://warontherocks.com/feed/' },
    { name: 'CSIS', url: 'https://www.csis.org/analysis/feed' },
    { name: 'Atlantic Council', url: 'https://www.atlanticcouncil.org/feed/' },
    { name: 'IAEA', url: 'https://www.iaea.org/feeds/press-releases' },
    { name: 'NTI', url: 'https://www.nti.org/feed/' },
    { name: 'RFI', url: 'https://www.rfi.fr/en/rss' },
  ],
  cyber: [
    { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/' },
    { name: 'The Record', url: 'https://therecord.media/feed' },
    { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/' },
    { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml' },
  ],
  aviation: [
    { name: 'Aviation Week', url: 'https://aviationweek.com/rss.xml' },
    { name: 'FlightGlobal', url: 'https://www.flightglobal.com/rss' },
    { name: 'Simple Flying', url: 'https://simpleflying.com/feed/' },
    { name: 'The Points Guy', url: 'https://thepointsguy.com/feed/' },
    { name: 'Aviation Safety Net', url: 'https://aviation-safety.net/rss/latest-accidents.xml' },
  ],
  africa: [
    { name: 'BBC Africa', url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml' },
    { name: 'KTN News', url: 'https://www.standardmedia.co.ke/rss/headlines.php' },
    { name: 'The East African', url: 'https://www.theeastafrican.co.ke/tea/rss.xml' },
    { name: 'Nation Africa', url: 'https://nation.africa/kenya/rss.xml' },
    { name: 'Capital FM Kenya', url: 'https://www.capitalfm.co.ke/news/feed/' },
    { name: 'Africanews', url: 'https://www.africanews.com/feed/' },
    { name: 'Africa Confidential', url: 'https://www.africa-confidential.com/rss' },
    { name: 'ISS Africa', url: 'https://issafrica.org/iss-today/feed' },
  ],
};

function decodeHtmlEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘').replace(/&rdquo;/g, '”').replace(/&ldquo;/g, '“')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&nbsp;/g, ' ');
}

function safePubDate(raw) {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function parseRssItems(xml, source) {
  const items = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '';
    const link = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    const desc = (block.match(/<description[^>]*>([\s\S]*?)<\/description>/) || [])[1] || '';
    const cleanTitle = decodeHtmlEntities(title.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, '').trim());
    const cleanLink = link.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    if (cleanTitle.length > 10) {
      const isoDate = safePubDate(pubDate.replace(/<!\[CDATA\[|\]\]>/g, '').trim());
      items.push({
        title: cleanTitle,
        source,
        link: cleanLink,
        pubDate: isoDate,
        publishedAt: new Date(isoDate).getTime(),
        description: decodeHtmlEntities(desc.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, '').trim()).slice(0, 300),
      });
    }
    if (items.length >= MAX_ITEMS_PER_FEED) break;
  }
  return items;
}

async function fetchFeed(feed) {
  try {
    const resp = await fetch(feed.url, {
      headers: { 'User-Agent': CHROME_UA, Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) return [];
    const xml = await resp.text();
    return parseRssItems(xml, feed.name);
  } catch {
    return [];
  }
}

async function buildDigest() {
  const categories = {};
  const seen = new Set();

  for (const [category, feeds] of Object.entries(FEEDS)) {
    const results = await Promise.all(feeds.map(fetchFeed));
    const items = results.flat().filter(item => {
      if (seen.has(item.title)) return false;
      seen.add(item.title);
      return true;
    });
    items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    for (const item of items) {
      item.threat = classifyByKeyword(item.title, category);
    }
    categories[category] = { items };
    console.log(`  ${category}: ${items.length} items`);
  }

  return {
    categories,
    feedStatuses: {},
    generatedAt: new Date().toISOString(),
  };
}

// Upgrades keyword-classified items in place to their cached llm classification,
// mirroring list-feed-digest.ts's enrichWithAiCache() (the live RPC path) —
// ais-relay.cjs's classify loop is what actually populates this cache.
async function enrichWithAiCache(digest, url, token) {
  const allItems = Object.values(digest.categories).flatMap(b => b.items ?? []);
  if (allItems.length === 0) return { classified: 0 };

  const keys = allItems.map(item => classifyCacheKey(item.title));
  let result;
  try {
    result = await redisCommand(url, token, ['MGET', ...keys]);
  } catch {
    return { classified: 0 };
  }
  const values = result?.result;
  if (!Array.isArray(values)) return { classified: 0 };

  let classified = 0;
  for (let i = 0; i < allItems.length; i++) {
    const raw = values[i];
    if (!raw) continue;
    let hit;
    try {
      hit = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!hit || hit.level === '_skip' || !hit.level || !hit.category) continue;
    allItems[i].threat = { level: hit.level, category: hit.category, confidence: 0.9, source: 'llm' };
    classified++;
  }
  return { classified };
}

async function run() {
  console.log('[news-digest] Building lightweight digest from RSS feeds...');
  const digest = await buildDigest();
  const totalItems = Object.values(digest.categories).reduce((sum, b) => sum + b.items.length, 0);
  console.log(`  Total: ${totalItems} items across ${Object.keys(digest.categories).length} categories`);

  if (totalItems === 0) {
    console.warn('[news-digest] No items fetched — skipping write');
    process.exit(0);
  }

  const { url, token } = getRedisCredentials();

  const { classified } = await enrichWithAiCache(digest, url, token);
  console.log(`  llm-upgraded: ${classified}/${totalItems} items`);

  await redisSet(url, token, DIGEST_KEY, digest, DIGEST_TTL);
  console.log(`[news-digest] Written to ${DIGEST_KEY} (TTL ${DIGEST_TTL}s)`);
}

run().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});

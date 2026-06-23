#!/usr/bin/env node

/**
 * Lightweight news digest seeder for self-hosted deployments.
 * Fetches top RSS feeds, builds a digest, and writes to Redis so
 * seed-insights.mjs can consume it.
 */

import { loadEnvFile, CHROME_UA, getRedisCredentials, redisSet } from './_seed-utils.mjs';

loadEnvFile(import.meta.url);

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
};

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
    const cleanTitle = title.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, '').trim();
    const cleanLink = link.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    if (cleanTitle.length > 10) {
      items.push({
        title: cleanTitle,
        source,
        link: cleanLink,
        pubDate: pubDate.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || new Date().toISOString(),
        description: desc.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, '').trim().slice(0, 300),
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
    categories[category] = { items };
    console.log(`  ${category}: ${items.length} items`);
  }

  return {
    categories,
    feedStatuses: {},
    generatedAt: new Date().toISOString(),
  };
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
  await redisSet(url, token, DIGEST_KEY, digest, DIGEST_TTL);
  console.log(`[news-digest] Written to ${DIGEST_KEY} (TTL ${DIGEST_TTL}s)`);
}

run().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});

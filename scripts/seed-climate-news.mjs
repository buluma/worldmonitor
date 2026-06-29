#!/usr/bin/env node
/**
 * Seed climate news intelligence to Redis.
 *
 * Key written:
 *   climate:news-intelligence:v1
 *
 * Sources (all free, no auth):
 *   Carbon Brief, Guardian Environment, NASA Earth Observatory,
 *   UNEP, Inside Climate News, Phys.org, Copernicus Climate
 *
 * TTL: 90min (refreshed every 30min by cron)
 */

import { loadEnvFile, CHROME_UA, writeExtraKeyWithMeta } from './_seed-utils.mjs';

loadEnvFile(import.meta.url);

const CANONICAL_KEY = 'climate:news-intelligence:v1';
const TTL = 5400; // 90min
const MAX_ITEMS = 100;
const RSS_MAX_BYTES = 500_000;

const FEEDS = [
  { sourceName: 'Carbon Brief', url: 'https://www.carbonbrief.org/feed' },
  { sourceName: 'The Guardian Environment', url: 'https://www.theguardian.com/environment/climate-crisis/rss' },
  { sourceName: 'NASA Earth Observatory', url: 'https://earthobservatory.nasa.gov/feeds/earth-observatory.rss' },
  { sourceName: 'UNEP', url: 'https://www.unep.org/rss.xml' },
  { sourceName: 'Phys.org Earth Science', url: 'https://phys.org/rss-feed/earth-news/earth-sciences/' },
  { sourceName: 'Inside Climate News', url: 'https://insideclimatenews.org/feed/' },
  { sourceName: 'Copernicus Climate', url: 'https://climate.copernicus.eu/rss.xml' },
];

function stableHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function extractTag(block, tagName) {
  const re = new RegExp(`<${tagName}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tagName}>`, 'i');
  return (block.match(re) || [])[1]?.trim() || '';
}

function cleanSummary(raw) {
  return decodeHtmlEntities(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function parseDateMs(block) {
  const raw = extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'updated');
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function extractLink(block) {
  const direct = extractTag(block, 'link');
  if (direct) return decodeHtmlEntities(direct).trim();
  const href = (block.match(/<link[^>]*\bhref=(["'])(.*?)\1[^>]*\/?>/i) || [])[2] || '';
  return decodeHtmlEntities(href).trim();
}

function parseRssItems(xml, sourceName) {
  const bounded = xml.length > RSS_MAX_BYTES ? xml.slice(0, RSS_MAX_BYTES) : xml;
  const items = [];
  const seenIds = new Set();

  const pushItem = (block, summaryTags) => {
    const title = decodeHtmlEntities(extractTag(block, 'title'));
    const url = extractLink(block);
    const publishedAt = parseDateMs(block);
    const rawSummary = summaryTags.map(t => extractTag(block, t)).find(Boolean) || '';
    if (!title || !url || !publishedAt) return;
    const id = `${stableHash(url)}-${publishedAt}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);
    items.push({ id, title, url, sourceName, publishedAt, summary: cleanSummary(rawSummary) });
  };

  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(bounded)) !== null) pushItem(m[1], ['description', 'summary', 'content:encoded']);

  const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  while ((m = entryRe.exec(bounded)) !== null) pushItem(m[1], ['summary', 'content']);

  return items;
}

async function fetchFeed(feed) {
  try {
    const resp = await fetch(feed.url, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*', 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) { console.warn(`  ${feed.sourceName}: HTTP ${resp.status}`); return []; }
    const xml = await resp.text();
    const items = parseRssItems(xml, feed.sourceName);
    console.log(`  ${feed.sourceName}: ${items.length} items`);
    return items;
  } catch (e) {
    console.warn(`  ${feed.sourceName}: ${e?.message || e}`);
    return [];
  }
}

async function main() {
  const settled = await Promise.allSettled(FEEDS.map(fetchFeed));
  const allItems = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') allItems.push(...r.value);
  }

  allItems.sort((a, b) => b.publishedAt - a.publishedAt);

  const seenUrls = new Set();
  const deduped = [];
  for (const item of allItems) {
    const h = stableHash(item.url);
    if (seenUrls.has(h)) continue;
    seenUrls.add(h);
    deduped.push(item);
    if (deduped.length >= MAX_ITEMS) break;
  }

  const payload = { items: deduped, fetchedAt: Date.now() };
  await writeExtraKeyWithMeta(CANONICAL_KEY, payload, TTL, deduped.length);
  console.log(`  climate-news: ${deduped.length} items across ${FEEDS.length} feeds`);
  console.log('climate news seed complete');
}

main().catch(e => { console.error(e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * Seed social velocity data to Redis.
 *
 * Key written:
 *   intelligence:social:reddit:v1
 *
 * Sources: Reddit JSON API (no auth required for public endpoints)
 * Subreddits: worldnews, geopolitics, GlobalNews, europe, CredibleDefense
 *
 * TTL: 30min (refreshed every 15min by cron)
 */

import { loadEnvFile, CHROME_UA, writeExtraKeyWithMeta } from './_seed-utils.mjs';

loadEnvFile(import.meta.url);

const REDIS_KEY = 'intelligence:social:reddit:v1';
const TTL = 1800; // 30min
const LIMIT_PER_SUB = 25;
const MAX_POSTS = 50;

const SUBREDDITS = [
  'worldnews',
  'geopolitics',
  'GlobalNews',
  'europe',
  'CredibleDefense',
];

const REDDIT_UA = 'worldmonitor-heimdal-seeder/1.0';

function velocityScore(post, nowMs) {
  const ageMs = nowMs - post.created_utc * 1000;
  const ageHours = Math.max(0.1, ageMs / 3_600_000);
  const decayFactor = Math.exp(-ageHours / 12); // half-life 12h
  return ((post.score * (post.upvote_ratio || 0.5)) / Math.sqrt(1 + post.num_comments)) * decayFactor * 100;
}

async function fetchSubreddit(sub) {
  try {
    const url = `https://www.reddit.com/r/${sub}/hot.json?limit=${LIMIT_PER_SUB}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': REDDIT_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) { console.warn(`  r/${sub}: HTTP ${resp.status}`); return []; }
    const data = await resp.json();
    const posts = (data?.data?.children || [])
      .map(c => c.data)
      .filter(p => p && !p.stickied && p.score > 50);
    console.log(`  r/${sub}: ${posts.length} posts`);
    return posts;
  } catch (e) {
    console.warn(`  r/${sub}: ${e?.message || e}`);
    return [];
  }
}

async function main() {
  const nowMs = Date.now();
  const settled = await Promise.allSettled(SUBREDDITS.map(fetchSubreddit));

  const seenIds = new Set();
  const allPosts = [];
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    for (const p of r.value) {
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      allPosts.push({
        id: p.id,
        title: p.title || '',
        subreddit: p.subreddit || '',
        url: p.url || `https://reddit.com${p.permalink}`,
        score: p.score || 0,
        upvoteRatio: p.upvote_ratio || 0,
        numComments: p.num_comments || 0,
        velocityScore: Math.round(velocityScore(p, nowMs) * 10) / 10,
        createdAt: (p.created_utc || 0) * 1000,
      });
    }
  }

  allPosts.sort((a, b) => b.velocityScore - a.velocityScore);
  const posts = allPosts.slice(0, MAX_POSTS);

  const payload = { posts, fetchedAt: nowMs };
  await writeExtraKeyWithMeta(REDIS_KEY, payload, TTL, posts.length);
  console.log(`  social-velocity: ${posts.length} posts from ${SUBREDDITS.length} subreddits`);
  console.log('social velocity seed complete');
}

main().catch(e => { console.error(e.message); process.exit(1); });

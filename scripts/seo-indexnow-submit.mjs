#!/usr/bin/env node
/**
 * Submit all wm.opsio.space URLs to IndexNow after deploy.
 * Run once after deploying the IndexNow key file:
 *   node scripts/seo-indexnow-submit.mjs
 *
 * IndexNow requires all URLs in one request to share the same host.
 * Submits separate batches per subdomain.
 */

const KEY = 'a7f3e9d1b2c44e8f9a0b1c2d3e4f5a6b';

const BATCHES = [
  {
    host: 'wm.opsio.space',
    urls: [
      'https://wm.opsio.space/',
      'https://wm.opsio.space/pro',
      'https://wm.opsio.space/blog/',
      'https://wm.opsio.space/blog/posts/what-is-worldmonitor-real-time-global-intelligence/',
      'https://wm.opsio.space/blog/posts/five-dashboards-one-platform-worldmonitor-variants/',
      'https://wm.opsio.space/blog/posts/track-global-conflicts-in-real-time/',
      'https://wm.opsio.space/blog/posts/cyber-threat-intelligence-for-security-teams/',
      'https://wm.opsio.space/blog/posts/osint-for-everyone-open-source-intelligence-democratized/',
      'https://wm.opsio.space/blog/posts/natural-disaster-monitoring-earthquakes-fires-volcanoes/',
      'https://wm.opsio.space/blog/posts/real-time-market-intelligence-for-traders-and-analysts/',
      'https://wm.opsio.space/blog/posts/monitor-global-supply-chains-and-commodity-disruptions/',
      'https://wm.opsio.space/blog/posts/satellite-imagery-orbital-surveillance/',
      'https://wm.opsio.space/blog/posts/live-webcams-from-geopolitical-hotspots/',
      'https://wm.opsio.space/blog/posts/prediction-markets-ai-forecasting-geopolitics/',
      'https://wm.opsio.space/blog/posts/command-palette-search-everything-instantly/',
      'https://wm.opsio.space/blog/posts/worldmonitor-in-21-languages-global-intelligence-for-everyone/',
      'https://wm.opsio.space/blog/posts/ai-powered-intelligence-without-the-cloud/',
      'https://wm.opsio.space/blog/posts/build-on-worldmonitor-developer-api-open-source/',
      'https://wm.opsio.space/blog/posts/worldmonitor-vs-traditional-intelligence-tools/',
      'https://wm.opsio.space/blog/posts/tracking-global-trade-routes-chokepoints-freight-costs/',
    ],
  },
  { host: 'tech.wm.opsio.space', urls: ['https://tech.wm.opsio.space/'] },
  { host: 'finance.wm.opsio.space', urls: ['https://finance.wm.opsio.space/'] },
  { host: 'happy.wm.opsio.space', urls: ['https://happy.wm.opsio.space/'] },
];

const ENDPOINTS = [
  'https://api.indexnow.org/IndexNow',
  'https://www.bing.com/IndexNow',
  'https://searchadvisor.naver.com/indexnow',
  'https://search.seznam.cz/indexnow',
  'https://yandex.com/indexnow',
];

async function submit(endpoint, host, urlList) {
  const keyLocation = `https://${host}/${KEY}.txt`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: KEY, keyLocation, urlList }),
  });
  return { endpoint, host, status: res.status, ok: res.ok };
}

for (const { host, urls } of BATCHES) {
  console.log(`\n[${host}] (${urls.length} URLs)`);
  const results = await Promise.allSettled(ENDPOINTS.map(ep => submit(ep, host, urls)));
  for (const r of results) {
    if (r.status === 'fulfilled') {
      console.log(`  ${r.value.ok ? '✓' : '✗'} ${r.value.endpoint.replace('https://', '')} → ${r.value.status}`);
    } else {
      console.log(`  ✗ error: ${r.reason}`);
    }
  }
}

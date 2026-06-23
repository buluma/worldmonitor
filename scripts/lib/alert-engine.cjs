'use strict';

const http = require('node:http');
const https = require('node:https');

// ─── Severity mapping ────────────────────────────────────────────────────────

const SEVERITY_EMOJI = {
  critical: '\u{1F534}',  // red circle
  warning: '\u{1F7E0}',   // orange circle
  info: '\u{1F535}',      // blue circle
};

// ─── Rule: Earthquakes ───────────────────────────────────────────────────────

function evalEarthquakes(data, cfg) {
  if (!data || !Array.isArray(data.earthquakes)) return [];
  const minMag = cfg.minMagnitude ?? 6.0;
  return data.earthquakes
    .filter((q) => q.magnitude >= minMag)
    .map((q) => ({
      ruleId: 'earthquake',
      dedupKey: `quake:${q.id}`,
      severity: q.magnitude >= 7.0 ? 'critical' : 'critical',
      title: `M${q.magnitude} Earthquake — ${q.place || 'Unknown'}`,
      lines: [
        q.depthKm != null ? `Depth: ${q.depthKm}km` : null,
        q.location ? `Location: ${q.location.latitude.toFixed(2)}, ${q.location.longitude.toFixed(2)}` : null,
        q.sourceUrl ? `Source: ${q.sourceUrl}` : 'Source: USGS',
      ].filter(Boolean),
    }));
}

// ─── Rule: Natural Events (volcanoes, tsunamis) ──────────────────────────────

const ALERTABLE_CATEGORIES = new Set(['volcanoes']);
const TSUNAMI_PATTERN = /tsunami/i;

function evalNaturalEvents(data, _cfg) {
  if (!data || !Array.isArray(data.events)) return [];
  return data.events
    .filter((e) => ALERTABLE_CATEGORIES.has(e.category) || TSUNAMI_PATTERN.test(e.title || '') || TSUNAMI_PATTERN.test(e.category || ''))
    .map((e) => ({
      ruleId: 'natural-event',
      dedupKey: `natural:${e.id || e.title}`,
      severity: 'critical',
      title: e.title || 'Natural Event Alert',
      lines: [
        e.category ? `Category: ${e.category}` : null,
        e.location ? `Location: ${e.location.latitude.toFixed(2)}, ${e.location.longitude.toFixed(2)}` : null,
      ].filter(Boolean),
    }));
}

// ─── Rule: Weather Alerts ────────────────────────────────────────────────────

const ALERTABLE_WEATHER = new Set([
  'Tornado Warning', 'Tornado Watch',
  'Hurricane Warning', 'Hurricane Watch',
  'Tsunami Warning', 'Tsunami Watch',
  'Severe Thunderstorm Warning',
  'Extreme Wind Warning',
  'Storm Surge Warning',
  'Flash Flood Emergency',
]);
const WEATHER_SEVERITIES = new Set(['Extreme', 'Severe']);

function evalWeather(data, _cfg) {
  if (!data || !Array.isArray(data.alerts)) return [];
  return data.alerts
    .filter((a) => WEATHER_SEVERITIES.has(a.severity) && ALERTABLE_WEATHER.has(a.event))
    .map((a) => ({
      ruleId: 'weather',
      dedupKey: `wx:${a.id}`,
      severity: a.severity === 'Extreme' ? 'critical' : 'warning',
      title: `${a.event} — ${a.areaDesc || 'Unknown Area'}`,
      lines: [
        a.headline || null,
        a.onset ? `Onset: ${a.onset}` : null,
        a.expires ? `Expires: ${a.expires}` : null,
      ].filter(Boolean),
    }));
}

// ─── Rule: Wildfires ─────────────────────────────────────────────────────────

function evalWildfires(data, cfg) {
  if (!data || !Array.isArray(data.fires)) return [];
  const minCluster = cfg.minClusterSize ?? 50;

  const regionBuckets = new Map();
  for (const f of data.fires) {
    if (f.confidence === 'low') continue;
    const lat = Math.round((f.latitude ?? 0) * 10) / 10;
    const lon = Math.round((f.longitude ?? 0) * 10) / 10;
    const key = `${lat},${lon}`;
    if (!regionBuckets.has(key)) regionBuckets.set(key, []);
    regionBuckets.get(key).push(f);
  }

  const alerts = [];
  for (const [coord, fires] of regionBuckets) {
    if (fires.length < minCluster) continue;
    const avgBrightness = fires.reduce((s, f) => s + (f.brightness || 0), 0) / fires.length;
    alerts.push({
      ruleId: 'wildfire',
      dedupKey: `fire:${coord}:${fires.length}`,
      severity: fires.length >= 100 ? 'critical' : 'warning',
      title: `Wildfire Cluster — ${fires.length} detections near ${coord}`,
      lines: [
        `Avg brightness: ${avgBrightness.toFixed(0)}K`,
        `Date: ${fires[0].acq_date || 'unknown'}`,
      ],
    });
  }
  return alerts;
}

// ─── Rule: Markets (stocks, commodities, crypto) ─────────────────────────────

function evalMarkets(stocks, commodities, crypto, cfg) {
  const movePct = cfg.movePct ?? 5;
  const alerts = [];

  function checkQuotes(source, label) {
    if (!source || !Array.isArray(source.quotes)) return;
    for (const q of source.quotes) {
      const change = q.change ?? 0;
      if (Math.abs(change) < movePct) continue;
      const direction = change > 0 ? 'up' : 'down';
      alerts.push({
        ruleId: 'market',
        dedupKey: `mkt:${q.symbol}:${direction}`,
        severity: Math.abs(change) >= 10 ? 'critical' : 'warning',
        title: `${q.symbol} ${direction === 'up' ? '▲' : '▼'}${Math.abs(change).toFixed(1)}%`,
        lines: [
          q.price != null ? `Price: $${q.price.toLocaleString()}` : null,
          `Type: ${label}`,
        ].filter(Boolean),
      });
    }
  }

  checkQuotes(stocks, 'Stock');
  checkQuotes(commodities, 'Commodity');
  checkQuotes(crypto, 'Crypto');
  return alerts;
}

// ─── Rule: Conflict (delta — new UCDP events) ───────────────────────────────

function evalConflict(data, prevIds, _cfg) {
  if (!data || !Array.isArray(data.events)) return [];
  const prev = prevIds instanceof Set ? prevIds : null;
  return data.events
    .filter((e) => !prev || !prev.has(e.id))
    .map((e) => ({
      ruleId: 'conflict',
      dedupKey: `conflict:${e.id}`,
      severity: (e.best ?? 0) >= 25 ? 'critical' : 'warning',
      title: `Conflict Event — ${e.country || 'Unknown'}`,
      lines: [
        e.date_start ? `Date: ${e.date_start}` : null,
        e.best != null ? `Fatalities (best est.): ${e.best}` : null,
        e.where_coordinates ? `Location: ${e.where_coordinates.latitude}, ${e.where_coordinates.longitude}` : null,
      ].filter(Boolean),
    }));
}

// ─── Format ──────────────────────────────────────────────────────────────────

function formatAlert(candidate) {
  const emoji = SEVERITY_EMOJI[candidate.severity] || SEVERITY_EMOJI.info;
  let text = `${emoji} *${candidate.title}*`;
  if (candidate.lines && candidate.lines.length > 0) {
    text += '\n' + candidate.lines.join('\n');
  }
  return text;
}

// ─── Dedup ───────────────────────────────────────────────────────────────────

async function shouldFire({ dedupKey, get, set, cooldownSec }) {
  const seenKey = `alerts:seen:${dedupKey}`;
  const existing = await get(seenKey);
  if (existing != null) return false;
  await set(seenKey, Date.now(), cooldownSec);
  return true;
}

// ─── Telegram Bot API ────────────────────────────────────────────────────────

function sendTelegramAlert({ botToken, chatId, text, baseUrl }) {
  const base = baseUrl || 'https://api.telegram.org';
  const urlStr = `${base}/bot${botToken}/sendMessage`;

  return new Promise((resolve) => {
    const url = new URL(urlStr);
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    }, (resp) => {
      let data = '';
      resp.on('data', (c) => { data += c; });
      resp.on('end', () => {
        resolve({ ok: resp.statusCode >= 200 && resp.statusCode < 300, status: resp.statusCode });
      });
    });
    req.on('error', (e) => resolve({ ok: false, status: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }); });
    req.end(body);
  });
}

// ─── Alert Cycle (orchestrator) ──────────────────────────────────────────────

const DEFAULT_THRESHOLDS = {
  earthquakeMinMag: 6.0,
  marketMovePct: 5,
  wildfireMinCluster: 50,
};

const SEED_KEYS = [
  'seismology:earthquakes:v1',
  'market:stocks-bootstrap:v1',
  'market:commodities-bootstrap:v1',
  'market:crypto:v1',
  'weather:alerts:v1',
  'natural:events:v1',
  'wildfire:fires:v1',
  'conflict:ucdp-events:v1',
];

async function runAlertCycle(deps) {
  const {
    mget, get, set, botToken, chatId, baseUrl, cooldownSec,
    thresholds: userThresholds,
  } = deps;
  const t = { ...DEFAULT_THRESHOLDS, ...userThresholds };

  const values = await mget(SEED_KEYS);
  const [earthquakes, stocks, commodities, crypto, weather, natural, wildfires, conflict] = values;

  const candidates = [
    ...evalEarthquakes(earthquakes, { minMagnitude: t.earthquakeMinMag }),
    ...evalMarkets(stocks, commodities, crypto, { movePct: t.marketMovePct }),
    ...evalWeather(weather, {}),
    ...evalNaturalEvents(natural, {}),
    ...evalWildfires(wildfires, { minClusterSize: t.wildfireMinCluster }),
    ...evalConflict(conflict, deps.prevConflictIds || null, {}),
  ];

  let sent = 0;
  for (const candidate of candidates) {
    const fire = await shouldFire({ dedupKey: candidate.dedupKey, get, set, cooldownSec });
    if (!fire) continue;
    const text = formatAlert(candidate);
    const result = await sendTelegramAlert({ botToken, chatId, text, baseUrl });
    if (result.ok) {
      sent++;
      console.log(`[Alert] Sent: ${candidate.title}`);
    } else {
      console.warn(`[Alert] Send failed (${result.status}): ${candidate.title}`);
    }
  }

  if (conflict && Array.isArray(conflict.events)) {
    deps.prevConflictIds = new Set(conflict.events.map((e) => e.id));
  }

  return { evaluated: candidates.length, sent };
}

module.exports = {
  evalEarthquakes,
  evalNaturalEvents,
  evalWeather,
  evalWildfires,
  evalMarkets,
  evalConflict,
  formatAlert,
  shouldFire,
  sendTelegramAlert,
  runAlertCycle,
  SEED_KEYS,
  DEFAULT_THRESHOLDS,
};

/**
 * Tests for the alert engine — rule evaluators, dedup, formatting, Telegram delivery.
 * Run: node --test scripts/alert-engine.test.cjs
 */
'use strict';

const { strict: assert } = require('node:assert');
const http = require('node:http');
const test = require('node:test');

const {
  evalEarthquakes,
  evalNaturalEvents,
  evalWeather,
  evalWildfires,
  evalMarkets,
  evalConflict,
  formatAlert,
  shouldFire,
  sendTelegramAlert,
} = require('./lib/alert-engine.cjs');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('listening', () => resolve(server.address().port));
    server.once('error', reject);
    server.listen(port, '127.0.0.1');
  });
}

function fakeStore() {
  const map = new Map();
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value, _ttl) => { map.set(key, value); return true; },
    map,
  };
}

// ─── evalEarthquakes ─────────────────────────────────────────────────────────

test('evalEarthquakes: fires on M6+ quake', () => {
  const data = {
    earthquakes: [
      { id: 'us7000abc', magnitude: 6.5, place: '100km SW of Tokyo', occurredAt: Date.now(), location: { latitude: 35.0, longitude: 139.0 }, sourceUrl: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000abc' },
      { id: 'us7000def', magnitude: 4.2, place: 'near LA', occurredAt: Date.now(), location: { latitude: 34.0, longitude: -118.0 }, sourceUrl: '' },
    ],
  };
  const alerts = evalEarthquakes(data, { minMagnitude: 6.0 });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].ruleId, 'earthquake');
  assert.equal(alerts[0].dedupKey, 'quake:us7000abc');
  assert.equal(alerts[0].severity, 'critical');
  assert.ok(alerts[0].title.includes('6.5'));
});

test('evalEarthquakes: no alert below threshold', () => {
  const data = { earthquakes: [{ id: 'x', magnitude: 5.9, place: 'Nowhere', occurredAt: Date.now(), location: { latitude: 0, longitude: 0 }, sourceUrl: '' }] };
  assert.equal(evalEarthquakes(data, { minMagnitude: 6.0 }).length, 0);
});

test('evalEarthquakes: empty/malformed data returns empty', () => {
  assert.deepEqual(evalEarthquakes(null, { minMagnitude: 6.0 }), []);
  assert.deepEqual(evalEarthquakes({}, { minMagnitude: 6.0 }), []);
  assert.deepEqual(evalEarthquakes({ earthquakes: 'bad' }, { minMagnitude: 6.0 }), []);
});

test('evalEarthquakes: respects custom threshold', () => {
  const data = { earthquakes: [{ id: 'x', magnitude: 5.5, place: 'Here', occurredAt: Date.now(), location: { latitude: 0, longitude: 0 }, sourceUrl: '' }] };
  assert.equal(evalEarthquakes(data, { minMagnitude: 5.0 }).length, 1);
  assert.equal(evalEarthquakes(data, { minMagnitude: 5.6 }).length, 0);
});

// ─── evalNaturalEvents ───────────────────────────────────────────────────────

test('evalNaturalEvents: fires on volcanic eruption', () => {
  const data = {
    events: [
      { id: 'EONET_1234', title: 'Etna Eruption', category: 'volcanoes', location: { latitude: 37.7, longitude: 15.0 }, startedAt: Date.now() },
    ],
  };
  const alerts = evalNaturalEvents(data, {});
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].ruleId, 'natural-event');
  assert.ok(alerts[0].dedupKey.startsWith('natural:'));
});

test('evalNaturalEvents: fires on tsunami event', () => {
  const data = {
    events: [
      { id: 'EONET_5678', title: 'Tsunami Warning - Pacific', category: 'other', location: { latitude: 0, longitude: 180 }, startedAt: Date.now() },
    ],
  };
  const alerts = evalNaturalEvents(data, {});
  assert.equal(alerts.length, 1);
});

test('evalNaturalEvents: ignores non-alertable categories', () => {
  const data = {
    events: [
      { id: 'x', title: 'Dust Storm', category: 'dustHaze', location: { latitude: 0, longitude: 0 }, startedAt: Date.now() },
    ],
  };
  assert.equal(evalNaturalEvents(data, {}).length, 0);
});

test('evalNaturalEvents: empty/malformed data', () => {
  assert.deepEqual(evalNaturalEvents(null, {}), []);
  assert.deepEqual(evalNaturalEvents({}, {}), []);
});

// ─── evalWeather ─────────────────────────────────────────────────────────────

test('evalWeather: fires on Extreme severity tornado', () => {
  const data = {
    alerts: [
      { id: 'NWS-1', event: 'Tornado Warning', severity: 'Extreme', headline: 'Tornado heading NE', areaDesc: 'Oklahoma County', onset: '2026-06-23T00:00:00Z', expires: '2026-06-23T01:00:00Z' },
    ],
  };
  const alerts = evalWeather(data, {});
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].dedupKey, 'wx:NWS-1');
});

test('evalWeather: fires on hurricane warning with Severe severity', () => {
  const data = {
    alerts: [
      { id: 'NWS-2', event: 'Hurricane Warning', severity: 'Severe', headline: 'Cat 4 approaching', areaDesc: 'Gulf Coast', onset: '', expires: '' },
    ],
  };
  assert.equal(evalWeather(data, {}).length, 1);
});

test('evalWeather: ignores Moderate severity', () => {
  const data = {
    alerts: [
      { id: 'NWS-3', event: 'Wind Advisory', severity: 'Moderate', headline: 'Windy', areaDesc: 'Suburbs', onset: '', expires: '' },
    ],
  };
  assert.equal(evalWeather(data, {}).length, 0);
});

test('evalWeather: ignores non-alertable events even if Extreme', () => {
  const data = {
    alerts: [
      { id: 'NWS-4', event: 'Heat Advisory', severity: 'Extreme', headline: 'Hot', areaDesc: 'Desert', onset: '', expires: '' },
    ],
  };
  assert.equal(evalWeather(data, {}).length, 0);
});

test('evalWeather: empty/malformed', () => {
  assert.deepEqual(evalWeather(null, {}), []);
  assert.deepEqual(evalWeather({ alerts: 42 }, {}), []);
});

// ─── evalWildfires ───────────────────────────────────────────────────────────

test('evalWildfires: fires on high-count region', () => {
  const fires = [];
  for (let i = 0; i < 60; i++) {
    fires.push({ id: `f${i}`, latitude: 37.0, longitude: -122.0, confidence: 'high', brightness: 400, frp: 50, acq_date: '2026-06-23' });
  }
  const data = { fires };
  const alerts = evalWildfires(data, { minClusterSize: 50 });
  assert.ok(alerts.length >= 1);
  assert.equal(alerts[0].ruleId, 'wildfire');
});

test('evalWildfires: no alert below threshold', () => {
  const data = { fires: [{ id: 'f1', latitude: 37.0, longitude: -122.0, confidence: 'high', brightness: 300, frp: 10, acq_date: '2026-06-23' }] };
  assert.equal(evalWildfires(data, { minClusterSize: 50 }).length, 0);
});

test('evalWildfires: empty/malformed', () => {
  assert.deepEqual(evalWildfires(null, {}), []);
  assert.deepEqual(evalWildfires({ fires: 'nope' }, {}), []);
});

// ─── evalMarkets ─────────────────────────────────────────────────────────────

test('evalMarkets: fires on stock move > threshold', () => {
  const stocks = { quotes: [{ symbol: 'AAPL', name: 'Apple', price: 180, change: -6.2 }] };
  const alerts = evalMarkets(stocks, null, null, { movePct: 5 });
  assert.equal(alerts.length, 1);
  assert.ok(alerts[0].dedupKey.includes('AAPL'));
  assert.ok(alerts[0].title.includes('AAPL'));
});

test('evalMarkets: fires on commodity spike', () => {
  const commodities = { quotes: [{ symbol: 'GC=F', name: 'Gold', price: 2500, change: 7.3 }] };
  const alerts = evalMarkets(null, commodities, null, { movePct: 5 });
  assert.equal(alerts.length, 1);
  assert.ok(alerts[0].dedupKey.includes('GC=F'));
});

test('evalMarkets: fires on crypto crash', () => {
  const crypto = { quotes: [{ symbol: 'bitcoin', name: 'Bitcoin', price: 40000, change: -12.5, sparkline: [] }] };
  const alerts = evalMarkets(null, null, crypto, { movePct: 5 });
  assert.equal(alerts.length, 1);
});

test('evalMarkets: no alert within threshold', () => {
  const stocks = { quotes: [{ symbol: 'MSFT', name: 'Microsoft', price: 400, change: 2.1 }] };
  assert.equal(evalMarkets(stocks, null, null, { movePct: 5 }).length, 0);
});

test('evalMarkets: handles all null inputs', () => {
  assert.deepEqual(evalMarkets(null, null, null, { movePct: 5 }), []);
});

// ─── evalConflict ────────────────────────────────────────────────────────────

test('evalConflict: fires on new events not in previous snapshot', () => {
  const data = { events: [
    { id: 'ucdp-100', type_of_violence: 1, country: 'Syria', date_start: '2026-06-20', best: 15, where_coordinates: { latitude: 35.0, longitude: 38.0 } },
    { id: 'ucdp-101', type_of_violence: 2, country: 'Yemen', date_start: '2026-06-22', best: 8, where_coordinates: { latitude: 15.0, longitude: 44.0 } },
  ] };
  const prevIds = new Set(['ucdp-100']);
  const alerts = evalConflict(data, prevIds, {});
  assert.equal(alerts.length, 1);
  assert.ok(alerts[0].dedupKey.includes('ucdp-101'));
});

test('evalConflict: no alerts when all events previously seen', () => {
  const data = { events: [{ id: 'ucdp-100', type_of_violence: 1, country: 'Syria', date_start: '2026-06-20', best: 5, where_coordinates: { latitude: 35.0, longitude: 38.0 } }] };
  const prevIds = new Set(['ucdp-100']);
  assert.equal(evalConflict(data, prevIds, {}).length, 0);
});

test('evalConflict: first run (no prev snapshot) fires on all', () => {
  const data = { events: [{ id: 'ucdp-200', type_of_violence: 1, country: 'Iraq', date_start: '2026-06-23', best: 20, where_coordinates: { latitude: 33.0, longitude: 44.0 } }] };
  const alerts = evalConflict(data, null, {});
  assert.equal(alerts.length, 1);
});

test('evalConflict: empty/malformed', () => {
  assert.deepEqual(evalConflict(null, null, {}), []);
  assert.deepEqual(evalConflict({}, null, {}), []);
});

// ─── formatAlert ─────────────────────────────────────────────────────────────

test('formatAlert: produces Markdown text with severity and title', () => {
  const candidate = {
    ruleId: 'earthquake',
    dedupKey: 'quake:x',
    severity: 'critical',
    title: 'M6.5 Earthquake — Tokyo',
    lines: ['Depth: 10km', 'Source: USGS'],
  };
  const text = formatAlert(candidate);
  assert.ok(text.includes('M6.5 Earthquake'));
  assert.ok(text.includes('Depth: 10km'));
  assert.ok(typeof text === 'string');
  assert.ok(text.length > 0);
});

test('formatAlert: handles empty lines', () => {
  const text = formatAlert({ ruleId: 'test', dedupKey: 'x', severity: 'warning', title: 'Test', lines: [] });
  assert.ok(text.includes('Test'));
});

// ─── shouldFire ──────────────────────────────────────────────────────────────

test('shouldFire: true on first occurrence', async () => {
  const store = fakeStore();
  const result = await shouldFire({ dedupKey: 'quake:abc', get: store.get, set: store.set, cooldownSec: 3600 });
  assert.equal(result, true);
  assert.ok(store.map.has('alerts:seen:quake:abc'));
});

test('shouldFire: false within cooldown', async () => {
  const store = fakeStore();
  await shouldFire({ dedupKey: 'quake:abc', get: store.get, set: store.set, cooldownSec: 3600 });
  const second = await shouldFire({ dedupKey: 'quake:abc', get: store.get, set: store.set, cooldownSec: 3600 });
  assert.equal(second, false);
});

test('shouldFire: different keys are independent', async () => {
  const store = fakeStore();
  await shouldFire({ dedupKey: 'quake:abc', get: store.get, set: store.set, cooldownSec: 3600 });
  const result = await shouldFire({ dedupKey: 'quake:def', get: store.get, set: store.set, cooldownSec: 3600 });
  assert.equal(result, true);
});

// ─── sendTelegramAlert ───────────────────────────────────────────────────────

test('sendTelegramAlert: sends POST to Bot API', async () => {
  let receivedBody = '';
  let receivedPath = '';
  const mockServer = http.createServer((req, res) => {
    receivedPath = req.url;
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      receivedBody = body;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: { message_id: 1 } }));
    });
  });

  const port = await listen(mockServer);
  try {
    const result = await sendTelegramAlert({
      botToken: 'TEST_TOKEN',
      chatId: '-100123456',
      text: 'Hello World',
      baseUrl: `http://127.0.0.1:${port}`,
    });
    assert.equal(result.ok, true);
    assert.equal(receivedPath, '/botTEST_TOKEN/sendMessage');
    const parsed = JSON.parse(receivedBody);
    assert.equal(parsed.chat_id, '-100123456');
    assert.equal(parsed.text, 'Hello World');
    assert.equal(parsed.parse_mode, 'Markdown');
  } finally {
    mockServer.close();
  }
});

test('sendTelegramAlert: returns ok=false on non-200', async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(403);
    res.end('Forbidden');
  });

  const port = await listen(mockServer);
  try {
    const result = await sendTelegramAlert({
      botToken: 'BAD_TOKEN',
      chatId: '-100123456',
      text: 'Nope',
      baseUrl: `http://127.0.0.1:${port}`,
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 403);
  } finally {
    mockServer.close();
  }
});

// ─── End-to-end: runAlertCycle mock ──────────────────────────────────────────

test('e2e: M6.5 quake produces one send, second cycle (cooldown) produces zero', async () => {
  const { runAlertCycle } = require('./lib/alert-engine.cjs');

  const quakePayload = {
    earthquakes: [
      { id: 'us7000xyz', magnitude: 6.5, place: 'Near Fiji', occurredAt: Date.now(), location: { latitude: -17.8, longitude: 178.0 }, sourceUrl: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000xyz' },
    ],
  };

  const sentMessages = [];
  const mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      sentMessages.push(JSON.parse(body));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: { message_id: sentMessages.length } }));
    });
  });

  const port = await listen(mockServer);
  const store = fakeStore();

  const redisData = {
    'seismology:earthquakes:v1': quakePayload,
    'market:stocks-bootstrap:v1': null,
    'market:commodities-bootstrap:v1': null,
    'market:crypto:v1': null,
    'weather:alerts:v1': null,
    'natural:events:v1': null,
    'wildfire:fires:v1': null,
    'conflict:ucdp-events:v1': null,
  };

  const deps = {
    mget: async (keys) => keys.map((k) => redisData[k] ?? null),
    get: store.get,
    set: store.set,
    botToken: 'TEST',
    chatId: '-100999',
    baseUrl: `http://127.0.0.1:${port}`,
    cooldownSec: 21600,
    thresholds: {},
  };

  try {
    await runAlertCycle(deps);
    assert.equal(sentMessages.length, 1, 'First cycle should send exactly one alert');
    assert.ok(sentMessages[0].text.includes('6.5'), 'Alert text should mention magnitude');

    await runAlertCycle(deps);
    assert.equal(sentMessages.length, 1, 'Second cycle should send zero (cooldown)');
  } finally {
    mockServer.close();
  }
});

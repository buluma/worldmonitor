/**
 * Wave-4 server handler correctness tests.
 *
 * Tests:
 *   1. list-climate-news: empty fallback, data passthrough
 *   2. list-defense-patents: empty fallback, limit/filter logic, source code shape
 *   3. get-social-velocity: empty fallback, data passthrough
 *   4. list-cross-source-signals: empty fallback, normalizeSignal, filter by type/severity
 *   5. list-ddos-attacks: empty fallback, partial data defaults
 *   6. list-traffic-anomalies: empty fallback, country filter
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const readSrc = (relPath) => readFileSync(resolve(root, relPath), 'utf-8');

// ─── 1. list-climate-news ─────────────────────────────────────────────────────

describe('list-climate-news handler', () => {
  const src = readSrc('server/worldmonitor/climate/v1/list-climate-news.ts');

  it('reads from correct Redis key', () => {
    assert.match(src, /climate:news-intelligence:v1/,
      'Handler must use key climate:news-intelligence:v1');
  });

  it('returns { items: [], fetchedAt: 0 } on null cache', () => {
    assert.match(src, /\?\?\s*\{\s*items\s*:\s*\[\]\s*,\s*fetchedAt\s*:\s*0\s*\}/,
      'Null cache fallback must be { items: [], fetchedAt: 0 }');
  });

  it('has try/catch returning empty on error', () => {
    assert.match(src, /catch[\s\S]*?return\s*\{\s*items\s*:\s*\[\]\s*,\s*fetchedAt\s*:\s*0\s*\}/,
      'Must catch and return empty on error');
  });
});

// ─── 2. list-defense-patents ──────────────────────────────────────────────────

describe('list-defense-patents handler', () => {
  const src = readSrc('server/worldmonitor/military/v1/list-defense-patents.ts');

  it('reads from correct Redis key', () => {
    assert.match(src, /patents:defense:latest/,
      'Must use seed key patents:defense:latest');
  });

  it('returns empty on null/missing cache', () => {
    assert.match(src, /patents:\s*\[\]\s*,\s*total:\s*0\s*,\s*fetchedAt:\s*''/,
      'Empty fallback must have patents:[], total:0, fetchedAt:\'\'');
  });

  it('caps limit at MAX_LIMIT (100)', () => {
    assert.match(src, /Math\.min\(req\.limit,\s*MAX_LIMIT\)/,
      'Must cap limit with Math.min');
    assert.match(src, /MAX_LIMIT\s*=\s*100/,
      'MAX_LIMIT must be 100');
  });

  it('uses DEFAULT_LIMIT (20) when req.limit <= 0', () => {
    assert.match(src, /req\.limit\s*>\s*0\s*\?\s*Math\.min\(req\.limit,\s*MAX_LIMIT\)\s*:\s*DEFAULT_LIMIT/,
      'Must fall back to DEFAULT_LIMIT when req.limit <= 0');
    assert.match(src, /DEFAULT_LIMIT\s*=\s*20/,
      'DEFAULT_LIMIT must be 20');
  });

  it('filters by cpcCode prefix (toUpperCase)', () => {
    assert.match(src, /req\.cpcCode\.toUpperCase\(\)/,
      'cpcCode filter must uppercase');
    assert.match(src, /p\.cpcCode\.startsWith\(code\)/,
      'Must filter by cpcCode prefix');
  });

  it('filters by assignee substring (case-insensitive)', () => {
    assert.match(src, /req\.assignee\.toLowerCase\(\)/,
      'assignee filter must lowercase');
    assert.match(src, /p\.assignee\.toLowerCase\(\)\.includes\(kw\)/,
      'Must filter by assignee substring');
  });
});

// ─── 3. get-social-velocity ───────────────────────────────────────────────────

describe('get-social-velocity handler', () => {
  const src = readSrc('server/worldmonitor/intelligence/v1/get-social-velocity.ts');

  it('reads from correct Redis key', () => {
    assert.match(src, /intelligence:social:reddit:v1/,
      'Must use key intelligence:social:reddit:v1');
  });

  it('returns { posts: [], fetchedAt: 0 } on null cache', () => {
    assert.match(src, /\?\?\s*\{\s*posts\s*:\s*\[\]\s*,\s*fetchedAt\s*:\s*0\s*\}/,
      'Null fallback must be { posts: [], fetchedAt: 0 }');
  });
});

// ─── 4. list-cross-source-signals ────────────────────────────────────────────

describe('list-cross-source-signals handler', () => {
  const src = readSrc('server/worldmonitor/intelligence/v1/list-cross-source-signals.ts');

  it('reads from correct Redis key', () => {
    assert.match(src, /intelligence:cross-source-signals:v1/,
      'Must use key intelligence:cross-source-signals:v1');
  });

  it('returns empty on null/non-object cache', () => {
    assert.match(src, /signals:\s*\[\]\s*,\s*evaluatedAt:\s*0\s*,\s*compositeCount:\s*0/,
      'Empty fallback must have signals:[], evaluatedAt:0, compositeCount:0');
  });

  it('normalizes unknown signal type to UNSPECIFIED', () => {
    assert.match(src, /CROSS_SOURCE_SIGNAL_TYPE_UNSPECIFIED/,
      'Must have UNSPECIFIED fallback for invalid signal types');
    assert.match(src, /toSignalType/,
      'Must have toSignalType normalizer function');
  });

  it('normalizes unknown severity to UNSPECIFIED', () => {
    assert.match(src, /CROSS_SOURCE_SIGNAL_SEVERITY_UNSPECIFIED/,
      'Must have UNSPECIFIED fallback for invalid severities');
    assert.match(src, /toSeverity/,
      'Must have toSeverity normalizer function');
  });

  it('has VALID_SIGNAL_TYPES set with known enum values', () => {
    assert.match(src, /CROSS_SOURCE_SIGNAL_TYPE_COMPOSITE_ESCALATION/);
    assert.match(src, /CROSS_SOURCE_SIGNAL_TYPE_MARKET_STRESS/);
    assert.match(src, /CROSS_SOURCE_SIGNAL_TYPE_RISK_SCORE_SPIKE/);
  });

  it('has VALID_SEVERITIES set with all 4 severities', () => {
    assert.match(src, /CROSS_SOURCE_SIGNAL_SEVERITY_LOW/);
    assert.match(src, /CROSS_SOURCE_SIGNAL_SEVERITY_MEDIUM/);
    assert.match(src, /CROSS_SOURCE_SIGNAL_SEVERITY_HIGH/);
    assert.match(src, /CROSS_SOURCE_SIGNAL_SEVERITY_CRITICAL/);
  });

  it('falls back signal id to signal:{index} when missing', () => {
    assert.match(src, /signal:\$\{index\}/,
      'Must fall back id to signal:{index}');
  });

  it('falls back theater to Global when missing', () => {
    assert.match(src, /'Global'/,
      'Must default theater to Global');
  });

  it('guards severityScore against non-finite values', () => {
    assert.match(src, /Number\.isFinite\(s\.severityScore\)/,
      'severityScore must be guarded with Number.isFinite');
  });
});

// ─── 5. list-ddos-attacks ────────────────────────────────────────────────────

describe('list-ddos-attacks handler', () => {
  const src = readSrc('server/worldmonitor/infrastructure/v1/list-ddos-attacks.ts');

  it('reads from correct Redis key', () => {
    assert.match(src, /cf:radar:ddos:v1/,
      'Must use key cf:radar:ddos:v1');
  });

  it('returns arrays for protocol and vector on null cache', () => {
    assert.match(src, /protocol:\s*data\?\.protocol\s*\|\|\s*\[\]/,
      'protocol must default to []');
    assert.match(src, /vector:\s*data\?\.vector\s*\|\|\s*\[\]/,
      'vector must default to []');
  });

  it('returns empty strings for dateRange on null cache', () => {
    assert.match(src, /dateRangeStart:\s*data\?\.dateRangeStart\s*\|\|\s*''/,
      'dateRangeStart must default to empty string');
    assert.match(src, /dateRangeEnd:\s*data\?\.dateRangeEnd\s*\|\|\s*''/,
      'dateRangeEnd must default to empty string');
  });

  it('returns empty topTargetLocations on null cache', () => {
    assert.match(src, /topTargetLocations:\s*data\?\.topTargetLocations\s*\|\|\s*\[\]/,
      'topTargetLocations must default to []');
  });

  it('has catch returning fully empty shape', () => {
    assert.match(src, /catch[\s\S]*?protocol:\s*\[\]\s*,\s*vector:\s*\[\]/,
      'catch must return empty protocol and vector arrays');
  });
});

// ─── 6. list-traffic-anomalies ───────────────────────────────────────────────

describe('list-traffic-anomalies handler', () => {
  const src = readSrc('server/worldmonitor/infrastructure/v1/list-traffic-anomalies.ts');

  it('reads from correct Redis key', () => {
    assert.match(src, /cf:radar:traffic-anomalies:v1/,
      'Must use key cf:radar:traffic-anomalies:v1');
  });

  it('returns empty anomalies on null cache', () => {
    assert.match(src, /data\?\.anomalies\s*\|\|\s*\[\]/,
      'anomalies must default to []');
  });

  it('filters by country code (toUpperCase)', () => {
    assert.match(src, /req\.country\.toUpperCase\(\)/,
      'country filter must uppercase');
    assert.match(src, /a\.locationCode\s*===\s*target/,
      'Must filter anomalies by locationCode === target');
  });

  it('computes totalCount from filtered anomalies length', () => {
    assert.match(src, /totalCount:\s*anomalies\.length/,
      'totalCount must reflect filtered anomalies length');
  });

  it('has catch returning { anomalies: [], totalCount: 0 }', () => {
    assert.match(src, /catch[\s\S]*?anomalies:\s*\[\]\s*,\s*totalCount:\s*0/,
      'catch must return anomalies:[] and totalCount:0');
  });
});

// ─── Handler registration checks ─────────────────────────────────────────────

describe('handler.ts registrations', () => {
  it('climate handler exports listClimateNews', () => {
    const src = readSrc('server/worldmonitor/climate/v1/handler.ts');
    assert.match(src, /listClimateNews/, 'climateHandler must include listClimateNews');
  });

  it('military handler exports listDefensePatents', () => {
    const src = readSrc('server/worldmonitor/military/v1/handler.ts');
    assert.match(src, /listDefensePatents/, 'militaryHandler must include listDefensePatents');
  });

  it('intelligence handler exports getSocialVelocity', () => {
    const src = readSrc('server/worldmonitor/intelligence/v1/handler.ts');
    assert.match(src, /getSocialVelocity/, 'intelligenceHandler must include getSocialVelocity');
  });

  it('intelligence handler exports listCrossSourceSignals', () => {
    const src = readSrc('server/worldmonitor/intelligence/v1/handler.ts');
    assert.match(src, /listCrossSourceSignals/, 'intelligenceHandler must include listCrossSourceSignals');
  });

  it('infrastructure handler exports listInternetDdosAttacks', () => {
    const src = readSrc('server/worldmonitor/infrastructure/v1/handler.ts');
    assert.match(src, /listInternetDdosAttacks/, 'infrastructureHandler must include listInternetDdosAttacks');
  });

  it('infrastructure handler exports listInternetTrafficAnomalies', () => {
    const src = readSrc('server/worldmonitor/infrastructure/v1/handler.ts');
    assert.match(src, /listInternetTrafficAnomalies/, 'infrastructureHandler must include listInternetTrafficAnomalies');
  });
});

// ─── Panel registration checks ────────────────────────────────────────────────

describe('Wave-4 panel registration', () => {
  const panelsSrc = readSrc('src/config/panels.ts');
  const layoutSrc = readSrc('src/app/panel-layout.ts');
  const indexSrc = readSrc('src/components/index.ts');
  const en = readSrc('src/locales/en.json');

  for (const id of ['climate-news', 'defense-patents', 'social-velocity', 'internet-disruptions', 'cross-source-signals']) {
    it(`panels.ts has '${id}'`, () => {
      assert.match(panelsSrc, new RegExp(`'${id}'`), `panels.ts missing '${id}'`);
    });

    it(`panel-layout.ts has lazyPanel('${id}')`, () => {
      assert.match(layoutSrc, new RegExp(`lazyPanel\\(['"]${id}['"]`),
        `panel-layout.ts missing lazyPanel('${id}')`);
    });
  }

  it('components/index.ts exports all 5 Wave-4 panel classes', () => {
    assert.match(indexSrc, /ClimateNewsPanel/);
    assert.match(indexSrc, /DefensePatentsPanel/);
    assert.match(indexSrc, /SocialVelocityPanel/);
    assert.match(indexSrc, /InternetDisruptionsPanel/);
    assert.match(indexSrc, /CrossSourceSignalsPanel/);
  });

  it('en.json has panel name keys for all 5 Wave-4 panels', () => {
    const obj = JSON.parse(en);
    assert.ok(obj.panels?.climateNews, 'Missing panels.climateNews');
    assert.ok(obj.panels?.defensePatents, 'Missing panels.defensePatents');
    assert.ok(obj.panels?.socialVelocity, 'Missing panels.socialVelocity');
    assert.ok(obj.panels?.internetDisruptions, 'Missing panels.internetDisruptions');
    assert.ok(obj.panels?.crossSourceSignals, 'Missing panels.crossSourceSignals');
  });

  it('en.json has component i18n for Wave-4 panels with tooltips', () => {
    const obj = JSON.parse(en);
    // Wave-4 panel sub-keys live under mcp (panel-specific component strings)
    assert.ok(obj.mcp?.climateNews?.infoTooltip, 'Missing mcp.climateNews.infoTooltip');
    assert.ok(obj.mcp?.defensePatents?.infoTooltip, 'Missing mcp.defensePatents.infoTooltip');
    assert.ok(obj.mcp?.socialVelocity?.infoTooltip, 'Missing mcp.socialVelocity.infoTooltip');
    assert.ok(obj.mcp?.internetDisruptions?.infoTooltip, 'Missing mcp.internetDisruptions.infoTooltip');
  });

  it('no Wave-4 panels have premium gating in panels.ts', () => {
    for (const id of ['climate-news', 'defense-patents', 'social-velocity', 'internet-disruptions', 'cross-source-signals']) {
      // Extract the block for this panel key and check for premium
      const start = panelsSrc.indexOf(`'${id}'`);
      if (start === -1) continue;
      const block = panelsSrc.slice(start, panelsSrc.indexOf('}', start) + 1);
      assert.doesNotMatch(block, /premium/,
        `Panel '${id}' must not have premium gating`);
    }
  });

  it('base.ts has REFRESH_INTERVALS for climateNews, defensePatents, socialVelocity, crossSourceSignals', () => {
    const baseSrc = readSrc('src/config/variants/base.ts');
    assert.match(baseSrc, /climateNews:/);
    assert.match(baseSrc, /defensePatents:/);
    assert.match(baseSrc, /socialVelocity:/);
    assert.match(baseSrc, /crossSourceSignals:/);
  });
});

// ─── Bootstrap key checks ─────────────────────────────────────────────────────

describe('Wave-4 bootstrap key registration', () => {
  const bootstrapSrc = readSrc('api/bootstrap.js');
  const cacheKeysSrc = readSrc('server/_shared/cache-keys.ts');

  for (const [name, key] of [
    ['climateNews', 'climate:news-intelligence:v1'],
    ['crossSourceSignals', 'intelligence:cross-source-signals:v1'],
    ['socialVelocity', 'intelligence:social:reddit:v1'],
    ['ddosAttacks', 'cf:radar:ddos:v1'],
    ['trafficAnomalies', 'cf:radar:traffic-anomalies:v1'],
  ]) {
    it(`bootstrap.js has ${name} → ${key}`, () => {
      assert.match(bootstrapSrc, new RegExp(`${name}.*${key.replace(/:/g, ':')}|${key.replace(/:/g, ':')}`),
        `bootstrap.js missing ${name} key`);
    });

    it(`cache-keys.ts has ${name} → ${key}`, () => {
      assert.match(cacheKeysSrc, new RegExp(key.replace(/:/g, ':')),
        `cache-keys.ts missing ${key}`);
    });
  }
});

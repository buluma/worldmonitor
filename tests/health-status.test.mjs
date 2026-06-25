import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const healthSrc = readFileSync(resolve(__dirname, '../api/health.js'), 'utf-8');

// Extract key names from an object-literal block in source text.
// Handles multi-line values including template literals.
function extractKeyNames(src, varName) {
  const pattern = new RegExp(`const ${varName} = \\{`, 'g');
  const startMatch = pattern.exec(src);
  assert.ok(startMatch, `${varName} must exist in health.js`);
  let depth = 1;
  let i = startMatch.index + startMatch[0].length;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  const block = src.slice(startMatch.index + startMatch[0].length, i - 1);
  return [...block.matchAll(/^\s*(\w+)\s*:/gm)].map(m => m[1]);
}

const bootstrapNames = new Set(extractKeyNames(healthSrc, 'BOOTSTRAP_KEYS'));
const standaloneNames = new Set(extractKeyNames(healthSrc, 'STANDALONE_KEYS'));
const allDataNames = new Set([...bootstrapNames, ...standaloneNames]);

describe('health.js status classification rules', () => {
  it('BOOTSTRAP_KEYS and STANDALONE_KEYS have no overlapping names', () => {
    const overlap = [...bootstrapNames].filter(n => standaloneNames.has(n));
    assert.equal(overlap.length, 0,
      `Keys exist in BOTH BOOTSTRAP_KEYS and STANDALONE_KEYS: ${overlap.join(', ')}`);
  });

  it('every SEED_META key references a name in BOOTSTRAP_KEYS or STANDALONE_KEYS (or is a known seeder-only tracker)', () => {
    // Some SEED_META entries track cross-cutting seeder freshness without a
    // direct data key (e.g. tokenPanels writes to 3 bootstrap keys, militaryForecastInputs
    // is an intermediate key consumed by the forecast seeder).
    const SEEDER_ONLY_META = new Set(['tokenPanels', 'militaryForecastInputs']);
    const metaNames = extractKeyNames(healthSrc, 'SEED_META');
    const orphans = metaNames.filter(n => !allDataNames.has(n) && !SEEDER_ONLY_META.has(n));
    assert.equal(orphans.length, 0,
      `SEED_META references keys not in BOOTSTRAP_KEYS or STANDALONE_KEYS: ${orphans.join(', ')}`);
  });

  it('ON_DEMAND_KEYS only references names in BOOTSTRAP_KEYS or STANDALONE_KEYS', () => {
    const onDemandMatch = healthSrc.match(/const ON_DEMAND_KEYS = new Set\(\[([\s\S]*?)\]\)/);
    assert.ok(onDemandMatch, 'ON_DEMAND_KEYS must exist');
    const onDemandNames = [...onDemandMatch[1].matchAll(/'(\w+)'/g)].map(m => m[1]);
    const orphans = onDemandNames.filter(n => !allDataNames.has(n));
    assert.equal(orphans.length, 0,
      `ON_DEMAND_KEYS references unknown keys: ${orphans.join(', ')}`);
  });

  it('CASCADE_GROUPS only references names in STANDALONE_KEYS', () => {
    const cascadeBlock = extractKeyNames(healthSrc, 'CASCADE_GROUPS');
    const cascadeMatch = healthSrc.match(/const CASCADE_GROUPS = \{([\s\S]*?)\n\};/);
    assert.ok(cascadeMatch, 'CASCADE_GROUPS must exist');
    const allCascadeRefs = [...new Set([...cascadeMatch[1].matchAll(/'(\w+)'/g)].map(m => m[1]))];
    const orphans = allCascadeRefs.filter(n => !standaloneNames.has(n));
    assert.equal(orphans.length, 0,
      `CASCADE_GROUPS references keys not in STANDALONE_KEYS: ${orphans.join(', ')}`);
  });

  it('EMPTY_DATA_OK_KEYS only references names in BOOTSTRAP_KEYS or STANDALONE_KEYS', () => {
    const emptyOkMatch = healthSrc.match(/const EMPTY_DATA_OK_KEYS = new Set\(\[([\s\S]*?)\]\)/);
    assert.ok(emptyOkMatch, 'EMPTY_DATA_OK_KEYS must exist');
    const emptyOkNames = [...emptyOkMatch[1].matchAll(/'(\w+)'/g)].map(m => m[1]);
    const orphans = emptyOkNames.filter(n => !allDataNames.has(n));
    assert.equal(orphans.length, 0,
      `EMPTY_DATA_OK_KEYS references unknown keys: ${orphans.join(', ')}`);
  });
});

describe('health.js status derivation logic (source verification)', () => {
  it('bootstrap keys: null/sentinel → EMPTY', () => {
    assert.ok(healthSrc.includes("if (!parsed || raw === NEG_SENTINEL)"),
      'must check for null/sentinel');
    assert.ok(healthSrc.includes("status = 'EMPTY'"),
      'null data must yield EMPTY status');
  });

  it('bootstrap keys: parsed but size 0 → EMPTY_DATA', () => {
    assert.ok(healthSrc.includes("status = 'EMPTY_DATA'"),
      'zero-size data must yield EMPTY_DATA status');
  });

  it('bootstrap keys: stale seed → STALE_SEED', () => {
    assert.ok(healthSrc.includes("status = 'STALE_SEED'"),
      'stale seed-meta must yield STALE_SEED');
  });

  it('standalone keys: cascade covered → OK_CASCADE', () => {
    assert.ok(healthSrc.includes("status = 'OK_CASCADE'"),
      'cascade-covered empty keys must yield OK_CASCADE');
  });

  it('standalone keys: on-demand empty → EMPTY_ON_DEMAND (not EMPTY)', () => {
    assert.ok(healthSrc.includes("status = 'EMPTY_ON_DEMAND'"),
      'on-demand keys must get EMPTY_ON_DEMAND, not critical EMPTY');
  });
});

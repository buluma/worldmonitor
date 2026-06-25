#!/usr/bin/env node

/**
 * Generates bootstrap cache-key blocks for edge-function files from the
 * canonical source in server/_shared/cache-keys.ts.
 *
 * Usage:
 *   node scripts/gen-cache-keys.mjs          # write generated blocks
 *   node scripts/gen-cache-keys.mjs --check  # verify committed files match
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CHECK_MODE = process.argv.includes('--check');

const CANONICAL = resolve(ROOT, 'server/_shared/cache-keys.ts');
const BOOTSTRAP_JS = resolve(ROOT, 'api/bootstrap.js');

const BEGIN = '// @gen-cache-keys:begin';
const END = '// @gen-cache-keys:end';

// --- Parse canonical cache-keys.ts ---

const src = readFileSync(CANONICAL, 'utf-8');

function parseObjectBlock(source, exportName) {
  const re = new RegExp(`export const ${exportName}[^{]*\\{([\\s\\S]*?)\\};`);
  const match = source.match(re);
  if (!match) throw new Error(`Could not find export "${exportName}" in cache-keys.ts`);
  const entries = [];
  for (const line of match[1].split('\n')) {
    const pairs = [...line.matchAll(/(\w+)\s*:\s*('[^']+')/g)];
    for (const m of pairs) {
      entries.push([m[1], m[2]]);
    }
  }
  return entries;
}

const cacheKeys = parseObjectBlock(src, 'BOOTSTRAP_CACHE_KEYS');
const tiers = parseObjectBlock(src, 'BOOTSTRAP_TIERS');

const tierMap = Object.fromEntries(tiers.map(([k, v]) => [k, v.replace(/'/g, '')]));

// --- Generate BOOTSTRAP_CACHE_KEYS block ---

function genCacheKeysObj(entries, indent = '  ') {
  return entries.map(([k, v]) => `${indent}${k}: ${v},`).join('\n');
}

function genTiersObj(entries, indent = '  ') {
  const lines = [];
  let line = indent;
  for (const [k, v] of entries) {
    const part = `${k}: ${v}, `;
    if (line.length + part.length > 120) {
      lines.push(line.trimEnd());
      line = indent;
    }
    line += part;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.join('\n');
}

function genSetsFromTiers(entries) {
  const slow = entries.filter(([, v]) => v === "'slow'").map(([k]) => `  '${k}',`);
  const fast = entries.filter(([, v]) => v === "'fast'").map(([k]) => `  '${k}',`);
  return { slow: slow.join('\n'), fast: fast.join('\n') };
}

const sets = genSetsFromTiers(tiers);

const generatedBlock = `${BEGIN}
const BOOTSTRAP_CACHE_KEYS = {
${genCacheKeysObj(cacheKeys)}
};

const BOOTSTRAP_TIERS = {
${genTiersObj(tiers)}
};

const SLOW_KEYS = new Set([
${sets.slow}
]);

const FAST_KEYS = new Set([
${sets.fast}
]);
${END}`;

// --- Apply to bootstrap.js ---

const bootstrapSrc = readFileSync(BOOTSTRAP_JS, 'utf-8');

if (!bootstrapSrc.includes(BEGIN)) {
  console.error(`ERROR: ${BOOTSTRAP_JS} does not contain marker "${BEGIN}".`);
  console.error('Add markers around the BOOTSTRAP_CACHE_KEYS / TIERS / SLOW_KEYS / FAST_KEYS blocks:');
  console.error(`  ${BEGIN}`);
  console.error('  ... existing blocks ...');
  console.error(`  ${END}`);
  process.exit(1);
}

const re = new RegExp(`${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
const newBootstrapSrc = bootstrapSrc.replace(re, generatedBlock);

if (CHECK_MODE) {
  if (newBootstrapSrc === bootstrapSrc) {
    console.log('✔ api/bootstrap.js is up-to-date with server/_shared/cache-keys.ts');
    process.exit(0);
  } else {
    console.error('✖ api/bootstrap.js is OUT OF SYNC with server/_shared/cache-keys.ts');
    console.error('Run: node scripts/gen-cache-keys.mjs');
    process.exit(1);
  }
} else {
  writeFileSync(BOOTSTRAP_JS, newBootstrapSrc);
  console.log(`✔ Wrote generated cache-key blocks to api/bootstrap.js`);
  console.log(`  ${cacheKeys.length} keys, ${tiers.length} tier entries`);
}

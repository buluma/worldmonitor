import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

describe('World Bank seed freshness', () => {
  const src = readFileSync(join(root, 'scripts', 'seed-wb-indicators.mjs'), 'utf-8');

  it('does not hard-code tech readiness end years to 2024', () => {
    assert.doesNotMatch(
      src,
      /2019:2024|2018:2024/,
      'Seed script should compute date ranges dynamically through the current year',
    );
  });

  it('defines tech readiness windows via lookback years', () => {
    assert.match(src, /lookbackYears:\s*7/, 'Recent WB indicators should include the current year window');
    assert.match(src, /lookbackYears:\s*8/, 'R&D indicator should use a slightly wider window');
    assert.match(src, /const dateRange = `\$\{startYear\}:\$\{currentYear\}`;/,
      'Seed script should build the date range from the current year');
  });
});

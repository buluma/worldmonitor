import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { validateTtlTable, SEED_TTL_TABLE } = await import('../scripts/_seed-ttl-table.mjs');

describe('seed TTL / maxStale coherence', () => {
  it('table has entries', () => {
    assert.ok(Object.keys(SEED_TTL_TABLE).length > 20, 'table should cover most seeders');
  });

  it('every TTL >= 2× its cron interval', () => {
    const violations = validateTtlTable().filter(v => v.includes('TTL'));
    assert.equal(violations.length, 0,
      `TTL invariant violated:\n${violations.join('\n')}`);
  });

  it('every maxStaleMin >= TTL in minutes', () => {
    const violations = validateTtlTable().filter(v => v.includes('maxStaleMin'));
    assert.equal(violations.length, 0,
      `maxStaleMin invariant violated:\n${violations.join('\n')}`);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { getHydratedData, clearHydrationCache } = await import('../src/services/bootstrap.ts');

const __dirname = dirname(fileURLToPath(import.meta.url));
const bootstrapSrc = readFileSync(resolve(__dirname, '../src/services/bootstrap.ts'), 'utf-8');

describe('getHydratedData semantics', () => {
  it('returns undefined for an unknown key', () => {
    assert.equal(getHydratedData('nonexistent'), undefined);
  });

  it('is exported and callable', () => {
    assert.equal(typeof getHydratedData, 'function');
  });

  it('is non-destructive (does not delete on read)', () => {
    const fn = bootstrapSrc.match(/export function getHydratedData[^}]+\}/s)?.[0] ?? '';
    assert.ok(!fn.includes('.delete('),
      'getHydratedData must not delete keys on read — consume-once footgun was removed');
  });
});

describe('clearHydrationCache', () => {
  it('is exported and callable', () => {
    assert.equal(typeof clearHydrationCache, 'function');
  });
});

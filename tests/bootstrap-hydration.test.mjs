import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '../src');

const { getHydratedData } = await import('../src/services/bootstrap.ts');

describe('getHydratedData consume-once semantics', () => {
  it('returns undefined for an unknown key', () => {
    assert.equal(getHydratedData('nonexistent'), undefined);
  });

  it('is exported and callable', () => {
    assert.equal(typeof getHydratedData, 'function');
  });
});

describe('bootstrap hydration key uniqueness guard', () => {
  function findTsFiles(dir) {
    const results = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'generated') {
        results.push(...findTsFiles(full));
      } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
        results.push(full);
      }
    }
    return results;
  }

  it('no bootstrap key is consumed by getHydratedData more than once across all source files', () => {
    const tsFiles = findTsFiles(srcDir);
    const keyCounts = new Map();

    for (const file of tsFiles) {
      const content = readFileSync(file, 'utf-8');
      const re = /getHydratedData\(\s*['"]([^'"]+)['"]\s*\)/g;
      let match;
      while ((match = re.exec(content)) !== null) {
        const key = match[1];
        if (!keyCounts.has(key)) keyCounts.set(key, []);
        const relPath = file.replace(srcDir + '/', '');
        const existing = keyCounts.get(key);
        if (!existing.includes(relPath)) {
          existing.push(relPath);
        }
      }
    }

    const duplicates = [];
    for (const [key, files] of keyCounts) {
      if (files.length > 1) {
        duplicates.push(`  "${key}" consumed in: ${files.join(', ')}`);
      }
    }

    assert.equal(duplicates.length, 0,
      `getHydratedData is consume-once (deletes on read). These keys are read from multiple files — second reader silently gets undefined:\n${duplicates.join('\n')}`);
  });
});

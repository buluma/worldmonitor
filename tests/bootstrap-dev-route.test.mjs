import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

describe('Bootstrap dev route wiring', () => {
  const viteSrc = readFileSync(join(root, 'vite.config.ts'), 'utf-8');

  it('registers a dedicated Vite middleware for /api/bootstrap', () => {
    assert.match(viteSrc, /function bootstrapApiPlugin\(\): Plugin \{/, 'Missing bootstrapApiPlugin');
    assert.match(viteSrc, /req\.url\?\.startsWith\('\/api\/bootstrap'\)/,
      'bootstrapApiPlugin must intercept /api/bootstrap requests');
    assert.match(viteSrc, /pathToFileURL\(resolve\(__dirname, 'api\/bootstrap\.js'\)\)\.href/,
      'bootstrapApiPlugin should resolve api/bootstrap.js through an absolute file URL');
    assert.match(viteSrc, /import\(`\$\{bootstrapModuleUrl\}\$\{Date\.now\(\)\}`\)/,
      'bootstrapApiPlugin must execute api/bootstrap.js, not serve it as a static file');
    assert.match(viteSrc, /bootstrapApiPlugin\(\)/, 'bootstrapApiPlugin must be registered in the Vite plugin list');
  });
});

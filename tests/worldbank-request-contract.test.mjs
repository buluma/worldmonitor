import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

describe('World Bank request contract', () => {
  const handlerSrc = readFileSync(
    join(root, 'server', 'worldmonitor', 'economic', 'v1', 'list-world-bank-indicators.ts'),
    'utf-8',
  );
  const protoSrc = readFileSync(
    join(root, 'proto', 'worldmonitor', 'economic', 'v1', 'list_world_bank_indicators.proto'),
    'utf-8',
  );

  it('supports exact-year queries without breaking lookback-window callers', () => {
    assert.match(
      handlerSrc,
      /if \(reqYear >= 1900 && reqYear <= currentYear\)/,
      'Handler must treat modern years as exact-year filters',
    );
    assert.match(
      handlerSrc,
      /const lookbackYears = reqYear > 0 \? reqYear : 5;/,
      'Handler must preserve lookback-window semantics for existing callers',
    );
    assert.match(
      handlerSrc,
      /date=\$\{startYear\}:\$\{endYear\}/,
      'Handler must build the upstream World Bank date range from normalized years',
    );
  });

  it('documents country_code as World Bank codes or lists, not alpha-2 only', () => {
    assert.match(
      protoSrc,
      /Optional World Bank country\/region code or semicolon-delimited list/,
      'Proto must describe the accepted country_code values',
    );
  });

  it('documents the dual meaning of year for backward compatibility', () => {
    assert.match(
      protoSrc,
      /Values >= 1900 request that exact year; smaller/,
      'Proto must describe exact-year behavior',
    );
    assert.match(
      protoSrc,
      /lookback window in years/,
      'Proto must describe lookback-window behavior',
    );
    assert.match(
      protoSrc,
      /compatibility/,
      'Proto must describe lookback-window behavior',
    );
  });
});

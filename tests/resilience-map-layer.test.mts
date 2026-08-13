import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LAYER_REGISTRY,
  getAllowedLayerKeys,
} from '../src/config/map-layer-definitions';
import {
  RESILIENCE_CHOROPLETH_COLORS,
  buildResilienceChoroplethMap,
  formatResilienceChoroplethLevel,
  getResilienceChoroplethLevel,
  normalizeExclusiveChoropleths,
} from '../src/components/resilience-choropleth-utils';

// Adapted from koala73/main's version of this suite. Dropped: the
// PREMIUM_RPC_PATHS / `premium: 'locked'` / `deckGLOnly` assertions — this
// fork has no premium gating (see [[koala73-ports]]) and no deckGLOnly
// concept; flat-only layers are gated purely by their `renderers` array +
// per-setter guards in MapContainer.ts, matching storageFacilities/
// diseaseOutbreaks. Also narrowed the "every variant" check to 'full' only —
// this fork only offers ciiChoropleth (resilienceScore's structural sibling)
// in the full variant, not tech/finance/happy/commodity.
describe('resilience map layer contracts', () => {
  it('registers resilienceScore as a flat-only layer, alongside ciiChoropleth in the full variant', () => {
    assert.equal(LAYER_REGISTRY.resilienceScore.renderers.join(','), 'flat');
    assert.ok(getAllowedLayerKeys('full').has('resilienceScore'));
    assert.ok(getAllowedLayerKeys('full').has('ciiChoropleth'));
  });
});

describe('resilience choropleth thresholds', () => {
  it('maps scores to the expected five-level scale', () => {
    assert.equal(getResilienceChoroplethLevel(10), 'very_low');
    assert.equal(getResilienceChoroplethLevel(25), 'low');
    assert.equal(getResilienceChoroplethLevel(45), 'moderate');
    assert.equal(getResilienceChoroplethLevel(65), 'high');
    assert.equal(getResilienceChoroplethLevel(85), 'very_high');
  });

  it('formats labels and keeps stable fill colors', () => {
    assert.equal(formatResilienceChoroplethLevel('very_high'), 'very high');
    assert.deepEqual(RESILIENCE_CHOROPLETH_COLORS.very_low, [239, 68, 68, 160]);
    assert.deepEqual(RESILIENCE_CHOROPLETH_COLORS.very_high, [34, 197, 94, 160]);
  });

  it('filters placeholder ranking rows and normalizes valid items', () => {
    const scores = buildResilienceChoroplethMap([
      { countryCode: 'NO', overallScore: 82, level: 'high', lowConfidence: false },
      { countryCode: 'US', overallScore: 61.234, level: 'medium', lowConfidence: true },
      { countryCode: 'YEM', overallScore: -1, level: 'unknown', lowConfidence: true },
    ]);

    assert.equal(scores.size, 2);
    assert.deepEqual(scores.get('NO'), {
      overallScore: 82,
      level: 'very_high',
      serverLevel: 'high',
      lowConfidence: false,
      outsideHeadlineRanking: false,
    });
    assert.deepEqual(scores.get('US'), {
      overallScore: 61.2,
      level: 'high',
      serverLevel: 'medium',
      lowConfidence: true,
      outsideHeadlineRanking: false,
    });
    assert.equal(scores.has('YEM'), false);
  });

  it('preserves scored greyedOut countries that are outside the headline ranking', () => {
    const scores = buildResilienceChoroplethMap([], [
      { countryCode: 'TV', overallScore: 70, level: 'medium', lowConfidence: false },
    ]);

    assert.deepEqual(scores.get('TV'), {
      overallScore: 70,
      level: 'high',
      serverLevel: 'medium',
      lowConfidence: false,
      outsideHeadlineRanking: true,
    });
  });

  it('renders true greyedOut no-score sentinels as insufficient data', () => {
    const scores = buildResilienceChoroplethMap([], [
      { countryCode: 'AQ', overallScore: 0, level: 'insufficient', lowConfidence: true },
    ]);

    assert.deepEqual(scores.get('AQ'), {
      overallScore: 0,
      level: 'insufficient_data',
      serverLevel: 'insufficient',
      lowConfidence: true,
      outsideHeadlineRanking: false,
    });
  });

  it('renders true items no-score sentinels as insufficient data', () => {
    const scores = buildResilienceChoroplethMap([
      { countryCode: 'ZZ', overallScore: 0, level: 'unknown', lowConfidence: false },
      { countryCode: 'YE', overallScore: -1, level: 'medium', lowConfidence: true },
    ]);

    assert.deepEqual(scores.get('ZZ'), {
      overallScore: 0,
      level: 'insufficient_data',
      serverLevel: 'unknown',
      lowConfidence: false,
      outsideHeadlineRanking: false,
    });
    assert.deepEqual(scores.get('YE'), {
      overallScore: 0,
      level: 'insufficient_data',
      serverLevel: 'medium',
      lowConfidence: true,
      outsideHeadlineRanking: false,
    });
  });
});

describe('resilience choropleth exclusivity', () => {
  const baseLayers = () => ({ ciiChoropleth: false, resilienceScore: false });

  it('keeps ciiChoropleth as the fallback when both choropleths arrive enabled without previous state', () => {
    const layers = normalizeExclusiveChoropleths({ ...baseLayers(), ciiChoropleth: true, resilienceScore: true });
    assert.equal(layers.resilienceScore, false);
    assert.equal(layers.ciiChoropleth, true);
  });

  it('preserves resilienceScore when it is the newly enabled choropleth', () => {
    const previousLayers = { ...baseLayers(), ciiChoropleth: true, resilienceScore: false };
    const layers = normalizeExclusiveChoropleths(
      { ...baseLayers(), ciiChoropleth: true, resilienceScore: true },
      previousLayers,
    );
    assert.equal(layers.resilienceScore, true);
    assert.equal(layers.ciiChoropleth, false);
  });

  it('preserves ciiChoropleth when it is the newly enabled choropleth', () => {
    const previousLayers = { ...baseLayers(), ciiChoropleth: false, resilienceScore: true };
    const layers = normalizeExclusiveChoropleths(
      { ...baseLayers(), ciiChoropleth: true, resilienceScore: true },
      previousLayers,
    );
    assert.equal(layers.resilienceScore, false);
    assert.equal(layers.ciiChoropleth, true);
  });

  it('is a no-op when only one choropleth is enabled', () => {
    const layers = normalizeExclusiveChoropleths({ ...baseLayers(), resilienceScore: true });
    assert.equal(layers.resilienceScore, true);
    assert.equal(layers.ciiChoropleth, false);
  });
});

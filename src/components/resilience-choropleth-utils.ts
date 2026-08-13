// Pure logic for the resilience map choropleth, extracted out of DeckGLMap.ts
// so it's testable without a WebGL/DOM environment — same reasoning as
// resilience-widget-utils.ts. Ported from koala73/main's
// src/components/resilience-choropleth-utils.ts, minus the premium/
// deckGLOnly plumbing this fork doesn't have (see [[koala73-ports]]).

export type ResilienceChoroplethLevel = 'very_low' | 'low' | 'moderate' | 'high' | 'very_high' | 'insufficient_data';

// 160-alpha fill so the choropleth reads clearly without drowning the base
// map. insufficient_data is a flat grey — distinct from the color ramp so a
// true zero-score sentinel never looks like a real "very low resilience"
// reading.
export const RESILIENCE_CHOROPLETH_COLORS: Record<ResilienceChoroplethLevel, [number, number, number, number]> = {
  very_low: [239, 68, 68, 160],
  low: [249, 115, 22, 160],
  moderate: [234, 179, 8, 160],
  high: [132, 204, 22, 160],
  very_high: [34, 197, 94, 160],
  insufficient_data: [120, 120, 120, 80],
};

export function getResilienceChoroplethLevel(score: number): Exclude<ResilienceChoroplethLevel, 'insufficient_data'> {
  if (score >= 80) return 'very_high';
  if (score >= 60) return 'high';
  if (score >= 40) return 'moderate';
  if (score >= 20) return 'low';
  return 'very_low';
}

export function formatResilienceChoroplethLevel(level: ResilienceChoroplethLevel): string {
  return level.replace(/_/g, ' ');
}

export interface ResilienceRankingRowLike {
  countryCode: string;
  overallScore: number;
  level: string;
  lowConfidence: boolean;
}

export interface ResilienceChoroplethEntry {
  overallScore: number;
  level: ResilienceChoroplethLevel;
  serverLevel: string;
  lowConfidence: boolean;
  outsideHeadlineRanking: boolean;
}

const ISO2_RE = /^[A-Z]{2}$/;

function roundScore(score: number): number {
  return Math.round(score * 10) / 10;
}

/**
 * Merges a ranking response's `items` (headline-eligible) and `greyedOut`
 * (below-confidence-bar) rows into one lookup keyed by ISO2. Rows with a
 * non-ISO2 country code (placeholder/legacy rows) are dropped. Rows with a
 * non-positive score are real "no usable score yet" sentinels, not actual
 * low-resilience readings — they get the dedicated `insufficient_data`
 * level and never count as outside-ranking (there's no ranking position to
 * be outside of).
 */
export function buildResilienceChoroplethMap(
  items: ResilienceRankingRowLike[],
  greyedOut: ResilienceRankingRowLike[] = [],
): Map<string, ResilienceChoroplethEntry> {
  const map = new Map<string, ResilienceChoroplethEntry>();

  const add = (row: ResilienceRankingRowLike, outsideHeadlineRanking: boolean): void => {
    const code = row.countryCode?.toUpperCase();
    if (!code || !ISO2_RE.test(code)) return;

    if (!Number.isFinite(row.overallScore) || row.overallScore <= 0) {
      map.set(code, {
        overallScore: 0,
        level: 'insufficient_data',
        serverLevel: row.level,
        lowConfidence: row.lowConfidence,
        outsideHeadlineRanking: false,
      });
      return;
    }

    map.set(code, {
      overallScore: roundScore(row.overallScore),
      level: getResilienceChoroplethLevel(row.overallScore),
      serverLevel: row.level,
      lowConfidence: row.lowConfidence,
      outsideHeadlineRanking,
    });
  };

  for (const row of items) add(row, false);
  for (const row of greyedOut) add(row, true);

  return map;
}

/**
 * CII and resilience are mutually exclusive choropleths — both painting at
 * once just looks broken. When a layer-state update would turn both on
 * simultaneously, keep whichever one was JUST enabled (per `previous`) and
 * drop the other; with no prior state to compare against, CII wins as the
 * default (it shipped first).
 */
export function normalizeExclusiveChoropleths<T extends { ciiChoropleth: boolean; resilienceScore: boolean }>(
  layers: T,
  previous: Pick<T, 'ciiChoropleth' | 'resilienceScore'> | null = null,
): T {
  if (!(layers.ciiChoropleth && layers.resilienceScore)) return layers;
  const resilienceIsNewlyEnabled = previous?.ciiChoropleth === true && previous?.resilienceScore === false;
  if (resilienceIsNewlyEnabled) return { ...layers, ciiChoropleth: false };
  return { ...layers, resilienceScore: false };
}

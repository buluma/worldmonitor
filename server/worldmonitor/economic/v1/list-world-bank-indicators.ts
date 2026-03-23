/**
 * RPC: listWorldBankIndicators -- World Bank development indicator data
 * Port from api/worldbank.js
 */

import type {
  ServerContext,
  ListWorldBankIndicatorsRequest,
  ListWorldBankIndicatorsResponse,
  WorldBankCountryData,
} from '../../../../src/generated/server/worldmonitor/economic/v1/service_server';

import { CHROME_UA } from '../../../_shared/constants';
import { cachedFetchJson } from '../../../_shared/redis';

const REDIS_CACHE_KEY = 'economic:worldbank:v1';
const REDIS_CACHE_TTL = 86400; // 24 hr — annual data

const TECH_COUNTRIES = [
  'USA', 'CHN', 'JPN', 'DEU', 'KOR', 'GBR', 'IND', 'ISR', 'SGP', 'TWN',
  'FRA', 'CAN', 'SWE', 'NLD', 'CHE', 'FIN', 'IRL', 'AUS', 'BRA', 'IDN',
  'ARE', 'SAU', 'QAT', 'BHR', 'EGY', 'TUR',
  'MYS', 'THA', 'VNM', 'PHL',
  'ESP', 'ITA', 'POL', 'CZE', 'DNK', 'NOR', 'AUT', 'BEL', 'PRT', 'EST',
  'MEX', 'ARG', 'CHL', 'COL',
  'ZAF', 'NGA', 'KEN',
];

function normalizeWorldBankDateRange(reqYear: number, currentYear: number): { startYear: number; endYear: number } {
  // Backward compatibility: small positive values are treated as a lookback window
  // because the current client passes `year=5` to mean "last 5 years".
  if (reqYear >= 1900 && reqYear <= currentYear) {
    return { startYear: reqYear, endYear: reqYear };
  }

  const lookbackYears = reqYear > 0 ? reqYear : 5;
  return { startYear: currentYear - lookbackYears, endYear: currentYear };
}

async function fetchWorldBankIndicators(
  req: ListWorldBankIndicatorsRequest,
): Promise<WorldBankCountryData[]> {
  try {
    const indicator = req.indicatorCode;
    if (!indicator) return [];

    const countryList = req.countryCode || TECH_COUNTRIES.join(';');
    const currentYear = new Date().getFullYear();
    const { startYear, endYear } = normalizeWorldBankDateRange(req.year, currentYear);

    const wbUrl = `https://api.worldbank.org/v2/country/${countryList}/indicator/${indicator}?format=json&date=${startYear}:${endYear}&per_page=1000`;

    const response = await fetch(wbUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': CHROME_UA,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return [];

    const data = await response.json();
    if (!data || !Array.isArray(data) || data.length < 2 || !data[1]) return [];

    const records: any[] = data[1];
    const indicatorName = records[0]?.indicator?.value || indicator;

    return records
      .filter((r: any) => r.countryiso3code && r.value !== null)
      .map((r: any): WorldBankCountryData => ({
        countryCode: r.countryiso3code || r.country?.id || '',
        countryName: r.country?.value || '',
        indicatorCode: indicator,
        indicatorName,
        year: parseInt(r.date, 10) || 0,
        value: r.value,
      }));
  } catch {
    return [];
  }
}

export async function listWorldBankIndicators(
  _ctx: ServerContext,
  req: ListWorldBankIndicatorsRequest,
): Promise<ListWorldBankIndicatorsResponse> {
  try {
    const cacheKey = `${REDIS_CACHE_KEY}:${req.indicatorCode}:${req.countryCode || 'all'}:${req.year || 0}`;
    const result = await cachedFetchJson<ListWorldBankIndicatorsResponse>(cacheKey, REDIS_CACHE_TTL, async () => {
      const data = await fetchWorldBankIndicators(req);
      return data.length > 0 ? { data, pagination: undefined } : null;
    });
    return result || { data: [], pagination: undefined };
  } catch {
    return { data: [], pagination: undefined };
  }
}

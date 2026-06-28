import type {
  ClimateServiceHandler,
  ServerContext,
  ListClimateNewsRequest,
  ListClimateNewsResponse,
} from '../../../../src/generated/server/worldmonitor/climate/v1/service_server';

import { getCachedJson } from '../../../_shared/redis';

const CLIMATE_NEWS_KEY = 'climate:news-intelligence:v1';

export const listClimateNews: ClimateServiceHandler['listClimateNews'] = async (
  _ctx: ServerContext,
  _req: ListClimateNewsRequest,
): Promise<ListClimateNewsResponse> => {
  try {
    const result = await getCachedJson(CLIMATE_NEWS_KEY, true) as ListClimateNewsResponse | null;
    return result ?? { items: [], fetchedAt: 0 };
  } catch {
    return { items: [], fetchedAt: 0 };
  }
};

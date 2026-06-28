import type { ClimateServiceHandler } from '../../../../src/generated/server/worldmonitor/climate/v1/service_server';

import { listClimateAnomalies } from './list-climate-anomalies';
import { listClimateNews } from './list-climate-news';

export const climateHandler: ClimateServiceHandler = {
  listClimateAnomalies,
  listClimateNews,
};

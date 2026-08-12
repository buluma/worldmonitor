import type { SupplyChainServiceHandler } from '../../../../src/generated/server/worldmonitor/supply_chain/v1/service_server';

import { getShippingRates } from './get-shipping-rates';
import { getChokepointStatus } from './get-chokepoint-status';
import { getCriticalMinerals } from './get-critical-minerals';
import { listEnergyDisruptions } from './list-energy-disruptions';
import { listFuelShortages } from './list-fuel-shortages';
import { getFuelShortageDetail } from './get-fuel-shortage-detail';
import { listPipelines } from './list-pipelines';
import { getPipelineDetail } from './get-pipeline-detail';
import { listStorageFacilities } from './list-storage-facilities';
import { getStorageFacilityDetail } from './get-storage-facility-detail';
import { getChinaCorridorControlTowers } from './get-china-corridor-control-towers';

export const supplyChainHandler: SupplyChainServiceHandler = {
  getShippingRates,
  getChokepointStatus,
  getCriticalMinerals,
  listEnergyDisruptions,
  listFuelShortages,
  getFuelShortageDetail,
  listPipelines,
  getPipelineDetail,
  listStorageFacilities,
  getStorageFacilityDetail,
  getChinaCorridorControlTowers,
};

import type {
  ServerContext,
  GetStorageFacilityDetailRequest,
  GetStorageFacilityDetailResponse,
} from '../../../../src/generated/server/worldmonitor/supply_chain/v1/service_server';
import { listStorageFacilities } from './list-storage-facilities';

export async function getStorageFacilityDetail(
  ctx: ServerContext,
  req: GetStorageFacilityDetailRequest,
): Promise<GetStorageFacilityDetailResponse> {
  const { facilities } = await listStorageFacilities(ctx, { facilityType: '' });
  const facility = facilities.find(f => f.id === req.facilityId);
  return {
    facility,
    revisions: [],
    fetchedAt: new Date().toISOString(),
    unavailable: !facility,
  };
}

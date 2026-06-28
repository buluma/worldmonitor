import type {
  ServerContext,
  GetFuelShortageDetailRequest,
  GetFuelShortageDetailResponse,
} from '../../../../src/generated/server/worldmonitor/supply_chain/v1/service_server';
import { listFuelShortages } from './list-fuel-shortages';

export async function getFuelShortageDetail(
  ctx: ServerContext,
  req: GetFuelShortageDetailRequest,
): Promise<GetFuelShortageDetailResponse> {
  const { shortages } = await listFuelShortages(ctx, { country: '', product: '', severity: '' });
  const shortage = shortages.find(s => s.id === req.shortageId);
  return {
    shortage,
    fetchedAt: new Date().toISOString(),
    unavailable: !shortage,
  };
}

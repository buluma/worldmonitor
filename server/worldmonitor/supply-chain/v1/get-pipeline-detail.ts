import type {
  ServerContext,
  GetPipelineDetailRequest,
  GetPipelineDetailResponse,
} from '../../../../src/generated/server/worldmonitor/supply_chain/v1/service_server';
import { listPipelines } from './list-pipelines';

export async function getPipelineDetail(
  ctx: ServerContext,
  req: GetPipelineDetailRequest,
): Promise<GetPipelineDetailResponse> {
  const { pipelines } = await listPipelines(ctx, { commodityType: '' });
  const pipeline = pipelines.find(p => p.id === req.pipelineId);
  return {
    pipeline,
    revisions: [],
    fetchedAt: new Date().toISOString(),
    unavailable: !pipeline,
  };
}

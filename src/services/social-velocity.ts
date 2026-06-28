import { getRpcBaseUrl } from '@/services/rpc-client';
import {
  IntelligenceServiceClient,
  type GetSocialVelocityResponse,
  type SocialVelocityPost,
} from '@/generated/client/worldmonitor/intelligence/v1/service_client';

export type { SocialVelocityPost };
import { getHydratedData } from '@/services/bootstrap';
import { createCircuitBreaker } from '@/utils';

const client = new IntelligenceServiceClient(getRpcBaseUrl(), { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) });
const breaker = createCircuitBreaker<GetSocialVelocityResponse>({ name: 'Social Velocity', cacheTtlMs: 15 * 60 * 1000, persistCache: true });
const emptyFallback: GetSocialVelocityResponse = { posts: [], fetchedAt: 0 };

export async function fetchSocialVelocity(): Promise<GetSocialVelocityResponse> {
  const hydrated = getHydratedData('socialVelocity') as GetSocialVelocityResponse | undefined;
  if (hydrated?.posts?.length) return hydrated;

  return breaker.execute(
    () => client.getSocialVelocity({}),
    emptyFallback,
    { shouldCache: (r) => r.posts.length > 0 },
  );
}

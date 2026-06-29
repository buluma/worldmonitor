// Stub: this self-host has no Clerk/Convex. Feature flag is always off.
// The FollowedOnlyChip reads isFollowFeatureEnabled() and hides itself when false.

export const FREE_TIER_FOLLOW_LIMIT = 3;
export const FOLLOWED_COUNTRIES_STORAGE_KEY = 'wm-followed-countries-v1';
export const WM_FOLLOWED_COUNTRIES_CHANGED = 'wm-followed-countries-changed';
export const WM_FOLLOWED_COUNTRIES_CAP_DROP = 'wm-followed-countries-cap-drop';

export type FollowMutationResult =
  | { ok: true }
  | { ok: false; reason: 'DISABLED' }
  | { ok: false; reason: 'INVALID_INPUT' }
  | { ok: false; reason: 'FREE_CAP'; currentCount?: number; limit?: number }
  | { ok: false; reason: 'ENTITLEMENT_LOADING' }
  | { ok: false; reason: 'HANDOFF_PENDING' }
  | { ok: false; reason: 'STORAGE_FULL' };

export type ServiceEntitlementState = 'pro' | 'free' | 'loading';

export function isFollowFeatureEnabled(): boolean {
  return false;
}

export function serviceEntitlementState(): ServiceEntitlementState {
  return 'free';
}

export function getFollowed(): string[] {
  return [];
}

export function isFollowed(_code: string): boolean {
  return false;
}

export function subscribe(_handler: () => void): () => void {
  return () => { /* no-op */ };
}

export async function addCountry(_input: string): Promise<FollowMutationResult> {
  return { ok: false, reason: 'DISABLED' };
}

export async function removeCountry(_input: string): Promise<FollowMutationResult> {
  return { ok: false, reason: 'DISABLED' };
}

export function installFollowedCountriesAuthListener(): void {
  /* no-op */
}

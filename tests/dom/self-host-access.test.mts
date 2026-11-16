import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasTabFocusForAccount, hasTravelRiskAssessmentForAccount, hasTier } from '@/services/entitlements';
import { isProUser } from '@/services/widget-store';

afterEach(() => vi.unstubAllEnvs());

describe('self-hosted local access', () => {
  it('enables dashboard controls in the self-hosted build', () => {
    vi.stubEnv('VITE_SELF_HOST_ACCESS', 'true');
    expect(isProUser()).toBe(true);
    expect(hasTier(1)).toBe(true);
    expect(hasTabFocusForAccount()).toBe(true);
    expect(hasTravelRiskAssessmentForAccount()).toBe(true);
  });

  it('does not grant focus or travel access on a cloud build without an entitlement', () => {
    vi.stubEnv('VITE_SELF_HOST_ACCESS', 'false');
    expect(hasTabFocusForAccount()).toBe(false);
    expect(hasTravelRiskAssessmentForAccount()).toBe(false);
  });
});

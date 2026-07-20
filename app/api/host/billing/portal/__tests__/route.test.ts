import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: false,
  createHostBillingPortalUrl: vi.fn(),
}));

vi.mock("@/lib/billing/payment-gate", () => ({
  isPaymentsEnabled: () => mocks.enabled,
  PAYMENTS_DISABLED_REASON: "payments_disabled",
}));
vi.mock("@/lib/db/host-dashboard", () => ({
  createHostBillingPortalUrl: mocks.createHostBillingPortalUrl,
  HostAccessError: class HostAccessError extends Error {},
}));

import { POST } from "@/app/api/host/billing/portal/route";

describe("billing portal payment gate", () => {
  beforeEach(() => {
    mocks.enabled = false;
    mocks.createHostBillingPortalUrl.mockReset();
  });

  it("returns 503 without resolving host identity or creating a portal", async () => {
    const response = await POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Payments are disabled.",
      code: "payments_disabled",
    });
    expect(mocks.createHostBillingPortalUrl).not.toHaveBeenCalled();
  });

  it("returns a portal URL only when the gate is enabled", async () => {
    mocks.enabled = true;
    mocks.createHostBillingPortalUrl.mockResolvedValue(
      "https://billing.stripe.test/session",
    );

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://billing.stripe.test/session",
    });
    expect(mocks.createHostBillingPortalUrl).toHaveBeenCalledOnce();
  });
});

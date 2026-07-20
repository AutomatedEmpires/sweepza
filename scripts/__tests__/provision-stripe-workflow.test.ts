import { describe, expect, it, vi } from "vitest";
import { runProvisioningWorkflow } from "../provision-stripe-workflow.mjs";

function workflow(overrides: Record<string, unknown> = {}) {
  return {
    preflight: { ok: true, errors: [] },
    expectedAccountId: "acct_Sweepza",
    retrieveAccount: vi.fn(async () => ({ id: "acct_Sweepza" })),
    discover: vi.fn(async () => ({ plans: [], webhook: {} })),
    reserveSecretOutput: vi.fn(() => ({ fd: 7 })),
    mutate: vi.fn(async () => ({ keepSecretOutput: false, plans: [] })),
    releaseSecretOutput: vi.fn(),
    ...overrides,
  };
}

describe("Stripe provisioning workflow ordering", () => {
  it("makes no provider or file call after static preflight refusal", async () => {
    const steps = workflow({
      preflight: { ok: false, errors: ["not approved"] },
    });

    await expect(runProvisioningWorkflow(steps)).rejects.toThrow("not approved");
    expect(steps.retrieveAccount).not.toHaveBeenCalled();
    expect(steps.discover).not.toHaveBeenCalled();
    expect(steps.reserveSecretOutput).not.toHaveBeenCalled();
    expect(steps.mutate).not.toHaveBeenCalled();
  });

  it("makes no discovery or mutation for an authenticated account mismatch", async () => {
    const steps = workflow({
      retrieveAccount: vi.fn(async () => ({ id: "acct_Other" })),
    });

    await expect(runProvisioningWorkflow(steps)).rejects.toThrow(
      "does not match expected",
    );
    expect(steps.discover).not.toHaveBeenCalled();
    expect(steps.reserveSecretOutput).not.toHaveBeenCalled();
    expect(steps.mutate).not.toHaveBeenCalled();
  });

  it("does not reserve or mutate when read-only discovery fails", async () => {
    const steps = workflow({
      discover: vi.fn(async () => {
        throw new Error("ambiguous provider state");
      }),
    });

    await expect(runProvisioningWorkflow(steps)).rejects.toThrow(
      "ambiguous provider state",
    );
    expect(steps.reserveSecretOutput).not.toHaveBeenCalled();
    expect(steps.mutate).not.toHaveBeenCalled();
  });

  it("makes no provider mutation when exclusive file reservation fails", async () => {
    const steps = workflow({
      reserveSecretOutput: vi.fn(() => {
        throw new Error("secret path exists or is unsafe");
      }),
    });

    await expect(runProvisioningWorkflow(steps)).rejects.toThrow(
      "secret path exists or is unsafe",
    );
    expect(steps.mutate).not.toHaveBeenCalled();
  });

  it("orders reads, reservation, mutation, and release", async () => {
    const order: string[] = [];
    const steps = workflow({
      retrieveAccount: vi.fn(async () => {
        order.push("account");
        return { id: "acct_Sweepza" };
      }),
      discover: vi.fn(async () => {
        order.push("discover");
        return { plans: [], webhook: {} };
      }),
      reserveSecretOutput: vi.fn(() => {
        order.push("reserve");
        return { fd: 7 };
      }),
      mutate: vi.fn(async () => {
        order.push("mutate");
        return { keepSecretOutput: true, plans: [] };
      }),
      releaseSecretOutput: vi.fn((_reservation, options) => {
        order.push(`release:${options.keepSecretOutput}`);
      }),
    });

    await runProvisioningWorkflow(steps);
    expect(order).toEqual([
      "account",
      "discover",
      "reserve",
      "mutate",
      "release:true",
    ]);
  });
});

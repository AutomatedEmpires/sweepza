import { describe, expect, it, vi } from "vitest";
import {
  listAllStripePages,
  persistWebhookSecretWithRollback,
  runProvisioningWorkflow,
} from "../provision-stripe-workflow.mjs";

function workflow(overrides: Record<string, unknown> = {}) {
  return {
    preflight: { ok: true, errors: [] },
    expectedAccountId: "acct_Sweepza",
    retrieveAccount: vi.fn(async () => ({ id: "acct_Sweepza" })),
    discover: vi.fn(async () => ({ plans: [], webhook: {} })),
    needsSecretOutput: vi.fn(() => true),
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

  it("does not reserve or release a file when discovery will reuse a webhook", async () => {
    const steps = workflow({
      discover: vi.fn(async () => ({
        plans: [],
        webhook: { existing: { id: "we_existing" } },
      })),
      needsSecretOutput: vi.fn(
        (discovery: { webhook: { existing: unknown } }) =>
          discovery.webhook.existing === null,
      ),
    });

    await runProvisioningWorkflow(steps);
    expect(steps.reserveSecretOutput).not.toHaveBeenCalled();
    expect(steps.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ webhook: { existing: { id: "we_existing" } } }),
      null,
    );
    expect(steps.releaseSecretOutput).not.toHaveBeenCalled();
  });
});

describe("Stripe list reconciliation", () => {
  it("exhausts cursor pages using the last object id", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: "prod_2" }], has_more: true })
      .mockResolvedValueOnce({ data: [{ id: "prod_1" }], has_more: false });

    await expect(
      listAllStripePages(fetchPage, { label: "product" }),
    ).resolves.toEqual([{ id: "prod_2" }, { id: "prod_1" }]);
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, "prod_2");
  });

  it("refuses malformed or unbounded pagination", async () => {
    await expect(
      listAllStripePages(
        vi.fn(async () => ({ data: [], has_more: true })),
        { label: "product" },
      ),
    ).rejects.toThrow("invalid product pagination");
    await expect(
      listAllStripePages(
        vi.fn(async () => ({ data: [{ id: "prod_same" }], has_more: true })),
        { label: "product", maxPages: 2 },
      ),
    ).rejects.toThrow("after 2 pages");
  });
});

describe("webhook secret rollback", () => {
  it("persists the one-time secret without rollback", async () => {
    const writeSecret = vi.fn();
    const deleteEndpoint = vi.fn();

    await persistWebhookSecretWithRollback({
      endpoint: { id: "we_123", secret: "whsec_value" },
      secretFd: 7,
      writeSecret,
      deleteEndpoint,
    });

    expect(writeSecret).toHaveBeenCalledWith(7, "whsec_value");
    expect(deleteEndpoint).not.toHaveBeenCalled();
  });

  it("deletes a newly created endpoint when secret persistence fails", async () => {
    const writeError = new Error("disk full");
    const deleteEndpoint = vi.fn(async () => undefined);

    await expect(
      persistWebhookSecretWithRollback({
        endpoint: { id: "we_123", secret: "whsec_value" },
        secretFd: 7,
        writeSecret: vi.fn(() => {
          throw writeError;
        }),
        deleteEndpoint,
      }),
    ).rejects.toBe(writeError);
    expect(deleteEndpoint).toHaveBeenCalledWith("we_123");
  });

  it("surfaces an orphan endpoint id when rollback also fails", async () => {
    await expect(
      persistWebhookSecretWithRollback({
        endpoint: { id: "we_orphan", secret: "whsec_value" },
        secretFd: 7,
        writeSecret: vi.fn(() => {
          throw new Error("disk full");
        }),
        deleteEndpoint: vi.fn(async () => {
          throw new Error("provider refused deletion");
        }),
      }),
    ).rejects.toThrow(
      "Webhook we_orphan was created, but secret persistence and rollback both failed",
    );
  });
});

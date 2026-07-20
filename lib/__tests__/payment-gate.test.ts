import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { PAYMENTS_ENABLED: undefined as string | undefined },
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));

import {
  assertPaymentsEnabled,
  isPaymentsEnabled,
  PaymentsDisabledError,
} from "@/lib/billing/payment-gate";

describe("payment activation gate", () => {
  beforeEach(() => {
    mocks.env.PAYMENTS_ENABLED = undefined;
  });

  it.each([undefined, "", "false", "1", "TRUE", " true "])(
    "fails closed for %j",
    (value) => {
      mocks.env.PAYMENTS_ENABLED = value;
      expect(isPaymentsEnabled()).toBe(false);
      expect(() => assertPaymentsEnabled()).toThrow(PaymentsDisabledError);
    },
  );

  it("allows only the literal string true", () => {
    mocks.env.PAYMENTS_ENABLED = "true";
    expect(isPaymentsEnabled()).toBe(true);
    expect(() => assertPaymentsEnabled()).not.toThrow();
  });
});

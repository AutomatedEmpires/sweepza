import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureCurrentAppUser: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  ensureCurrentAppUser: mocks.ensureCurrentAppUser,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import {
  getHostReviewQueue,
  getReviewListingById,
} from "@/lib/db/listing-review";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listing review DAL authorization", () => {
  it.each([
    null,
    {
      appUser: { is_admin: false, is_owner: false },
    },
  ])(
    "never creates a service-role client for a non-operator",
    async (operator) => {
      mocks.ensureCurrentAppUser.mockResolvedValue(operator);

      await expect(getHostReviewQueue()).resolves.toEqual([]);
      await expect(
        getReviewListingById(
          "11111111-1111-4111-8111-111111111111",
        ),
      ).resolves.toBeNull();
      expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    },
  );
});

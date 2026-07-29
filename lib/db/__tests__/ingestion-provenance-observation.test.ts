import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedCandidate } from "@/lib/ingestion/mapper";
import type { EvidenceFactor } from "@/lib/ingestion/verify";

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import {
  canonicalProvenanceIdentityForTest,
  createIngestedListingWithProvenance,
  type ProvenanceInput,
} from "@/lib/db/ingestion";

const LISTING_ID = "11111111-1111-4111-8111-111111111111";

function candidate(): NormalizedCandidate {
  return {
    title: "Official summer giveaway",
    shortDescription: "A verified official-source promotion.",
    longDescription: null,
    prizeName: "$500 gift card",
    prizeValue: 500,
    prizeCategory: "gift_cards",
    entryUrl: "https://sponsor.example.com/enter",
    officialRulesUrl: "https://sponsor.example.com/rules",
    startDate: "2026-07-01",
    endDate: "2026-08-31",
    entryFrequency: "one_time",
    eligibilityCountry: "US",
    eligibilityStates: null,
    ageRequirement: 18,
    noPurchaseNecessary: true,
    sponsorName: "Sponsor",
    sponsorUrl: "https://sponsor.example.com/",
    mainImageUrl: null,
    imageAltText: null,
    dedup: {
      urlKey: "https://sponsor.example.com/rules",
      contentKey: "fingerprint",
      variantKey: "2026-08-31|us|none",
    },
  };
}

function factor(): EvidenceFactor {
  return {
    id: "has_official_rules_url",
    weight: 0.2,
    hard: true,
    passed: true,
    explanation: "Official rules were present.",
  };
}

function provenance(
  overrides: Partial<ProvenanceInput> = {},
): ProvenanceInput {
  return {
    officialUrlKey: "https://sponsor.example.com/rules",
    contentFingerprint: "fingerprint",
    variantKey: "2026-08-31|us|none",
    discoverySource: "official_direct",
    officialSourceUrl: "https://sponsor.example.com/rules",
    extractionConfidence: 0.95,
    extractionFactors: [factor()],
    extractionSummary: "High-confidence official rules extraction.",
    contentHash: "content-hash",
    ...overrides,
  };
}

function clientWithRpc(
  results: Array<{
    data: unknown;
    error: { message: string } | null;
  }>,
) {
  return {
    rpc: vi.fn()
      .mockResolvedValueOnce(results[0])
      .mockResolvedValueOnce(results[1]),
  };
}

describe("canonical provenance identity", () => {
  it("is stable across insertion order without consulting host locale data", () => {
    const first = {
      "ä": 1,
      z: 2,
      A: 3,
      "😀": 4,
      "�": 5,
      nested: { b: 2, a: 1 },
    };
    const second = {
      nested: { a: 1, b: 2 },
      "�": 5,
      "😀": 4,
      A: 3,
      z: 2,
      "ä": 1,
    };
    const localeCompare = vi
      .spyOn(String.prototype, "localeCompare")
      .mockImplementation(() => {
        throw new Error("host locale ordering must not be used");
      });

    try {
      const firstIdentity =
        canonicalProvenanceIdentityForTest(first);
      expect(firstIdentity).toMatch(/^[0-9a-f]{64}$/);
      expect(
        canonicalProvenanceIdentityForTest(second),
      ).toBe(firstIdentity);
    } finally {
      localeCompare.mockRestore();
    }
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite numeric evidence %s instead of hashing it as null",
    (value) => {
      const nullIdentity = canonicalProvenanceIdentityForTest({
        confidence: null,
      });

      expect(() =>
        canonicalProvenanceIdentityForTest({ confidence: value }),
      ).toThrow("provenance contains a non-finite number");
      expect(nullIdentity).toMatch(/^[0-9a-f]{64}$/);
    },
  );
});

describe("ingestion provenance observation persistence", () => {
  beforeEach(() => {
    mocks.createServiceRoleClient.mockReset();
  });

  it.each([true, false])(
    "records the observation before returning when canonical created=%s",
    async (created) => {
      const client = clientWithRpc([
        {
          data: {
            listing_id: LISTING_ID,
            created,
            suspected_duplicate_ids: [],
          },
          error: null,
        },
        {
          data: { observation_id: 7, created: true },
          error: null,
        },
      ]);
      mocks.createServiceRoleClient.mockReturnValue(client);
      const input = provenance();

      await expect(
        createIngestedListingWithProvenance(candidate(), input),
      ).resolves.toEqual({
        listingId: LISTING_ID,
        created,
        suspectedDuplicateIds: [],
      });

      expect(client.rpc).toHaveBeenNthCalledWith(
        2,
        "record_listing_ingestion_observation",
        {
          p_listing_id: LISTING_ID,
          p_provenance_identity: expect.stringMatching(/^[0-9a-f]{64}$/),
          p_provenance: {
            officialUrlKey: input.officialUrlKey,
            contentFingerprint: input.contentFingerprint,
            variantKey: input.variantKey,
            discoverySource: input.discoverySource,
            officialSourceUrl: input.officialSourceUrl,
            extractionConfidence: input.extractionConfidence,
            extractionFactors: input.extractionFactors,
            extractionSummary: input.extractionSummary,
            contentHash: input.contentHash,
          },
        },
      );
    },
  );

  it("throws after a successful claim when observation persistence fails", async () => {
    const client = clientWithRpc([
      {
        data: {
          listing_id: LISTING_ID,
          created: false,
          suspected_duplicate_ids: [],
        },
        error: null,
      },
      {
        data: null,
        error: { message: "observation table unavailable" },
      },
    ]);
    mocks.createServiceRoleClient.mockReturnValue(client);

    await expect(
      createIngestedListingWithProvenance(candidate(), provenance()),
    ).rejects.toThrow(
      "observation failed: observation table unavailable",
    );
  });

  it("rejects an invalid observation acknowledgement", async () => {
    const client = clientWithRpc([
      {
        data: {
          listing_id: LISTING_ID,
          created: true,
          suspected_duplicate_ids: [],
        },
        error: null,
      },
      {
        data: { observation_id: null, created: true },
        error: null,
      },
    ]);
    mocks.createServiceRoleClient.mockReturnValue(client);

    await expect(
      createIngestedListingWithProvenance(candidate(), provenance()),
    ).rejects.toThrow("observation failed: invalid RPC result");
  });

  it("changes the provenance identity when extraction evidence changes", async () => {
    const client = {
      rpc: vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            listing_id: LISTING_ID,
            created: true,
            suspected_duplicate_ids: [],
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { observation_id: 7, created: true },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            listing_id: LISTING_ID,
            created: false,
            suspected_duplicate_ids: [],
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { observation_id: 8, created: true },
          error: null,
        }),
    };
    mocks.createServiceRoleClient.mockReturnValue(client);

    await createIngestedListingWithProvenance(candidate(), provenance());
    await createIngestedListingWithProvenance(
      candidate(),
      provenance({ extractionSummary: "Updated extraction evidence." }),
    );

    const firstIdentity = client.rpc.mock.calls[1]?.[1]
      ?.p_provenance_identity;
    const secondIdentity = client.rpc.mock.calls[3]?.[1]
      ?.p_provenance_identity;
    expect(firstIdentity).toMatch(/^[0-9a-f]{64}$/);
    expect(secondIdentity).toMatch(/^[0-9a-f]{64}$/);
    expect(secondIdentity).not.toBe(firstIdentity);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite extraction confidence %s before any database write",
    async (extractionConfidence) => {
      await expect(
        createIngestedListingWithProvenance(
          candidate(),
          provenance({ extractionConfidence }),
        ),
      ).rejects.toThrow("provenance contains a non-finite number");

      expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    },
  );
});

describe("listing ingestion observation migration contract", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20260729181206_listing_ingestion_observations.sql",
    ),
    "utf8",
  );

  it("keeps first-ingestion provenance separate from later observations", () => {
    expect(sql).toContain(
      "references public.listing_ingestion(listing_id) on delete cascade",
    );
    expect(sql).toContain(
      "unique (listing_id, provenance_identity)",
    );
    expect(sql).not.toMatch(/update\s+public\.listing_ingestion\b/i);
    expect(sql).not.toMatch(/alter\s+table\s+public\.listing_ingestion\b/i);
  });

  it("allows only the service role to append or refresh observations", () => {
    expect(sql).toContain(
      "create function public.record_listing_ingestion_observation",
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(sql).toContain(
      "to service_role;",
    );
    expect(sql).not.toMatch(
      /grant\s+(?:insert|update|delete)[^;]*listing_ingestion_observation[^;]*service_role/i,
    );
  });

  it("limits exposed reads to authenticated admins and owners", () => {
    expect(sql).toContain(
      "alter table public.listing_ingestion_observation enable row level security",
    );
    expect(sql).toContain("to authenticated");
    expect(sql).toContain("(select private.is_admin())");
    expect(sql).toContain("(select private.is_owner())");
    expect(sql).not.toMatch(
      /grant\s+select[^;]*listing_ingestion_observation[^;]*anon/i,
    );
  });

  it("detects identity collisions and refreshes only exact observations", () => {
    expect(sql).toContain(
      "on conflict (listing_id, provenance_identity) do nothing",
    );
    expect(sql).toContain(
      "provenance identity was already used for different evidence",
    );
    expect(sql).toContain("set last_observed_at = greatest(");
  });

  it("bounds every operator-readable evidence payload", () => {
    expect(sql).toContain("char_length(extraction_summary) <= 10000");
    expect(sql).toContain("char_length(content_hash) <= 512");
    expect(sql).toContain("jsonb_array_length(extraction_factors) <= 100");
    expect(sql).toContain("pg_column_size(extraction_factors) <= 65536");
    expect(sql).toContain(
      "provenance observation exceeds bounded text limits",
    );
    expect(sql).toContain(
      "extraction factors exceed bounded array limits",
    );
  });
});

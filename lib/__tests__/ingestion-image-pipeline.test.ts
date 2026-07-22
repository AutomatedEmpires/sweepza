import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { SourceHttpClient } from "@/lib/ingestion/http";
import type { ImageCandidate, ImageCandidateDiscovery } from "@/lib/ingestion/image-candidates";
import { processListingImage } from "@/lib/ingestion/image-pipeline";

async function prizeBytes(): Promise<Uint8Array> {
  return sharp({
    create: { width: 1200, height: 630, channels: 3, background: "#6d2e80" },
  }).jpeg().toBuffer();
}

function candidate(overrides: Partial<ImageCandidate> = {}): ImageCandidate {
  return {
    url: "https://sponsor.example.com/prize.jpg",
    method: "open_graph",
    role: "primary",
    score: 100,
    altText: "Grand prize package",
    context: "Official sweepstakes grand prize",
    widthHint: 1200,
    heightHint: 630,
    rights: {
      status: "permitted",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      attribution: "Sponsor",
      reason: "open license",
    },
    ...overrides,
  };
}

function discovery(candidates: ImageCandidate[]): ImageCandidateDiscovery {
  return { candidates, rejected: [] };
}

function http(result: Awaited<ReturnType<SourceHttpClient["getAsset"]>>) {
  const getAsset = vi.fn().mockResolvedValue(result);
  return {
    client: {
      getAsset,
      get: vi.fn(),
      resolve: vi.fn(),
      commitFetchState: vi.fn(),
      stats: vi.fn(() => ({ requests: 0, budget: 10, notModified: 0, failures: 0 })),
    } as unknown as SourceHttpClient,
    getAsset,
  };
}

describe("processListingImage", () => {
  it("uses a terminal generated fallback before fetching when storage is unconfigured", async () => {
    const transport = http({
      status: "failed",
      url: "https://sponsor.example.com/prize.jpg",
      failure: "network",
      httpStatus: null,
      attempts: 1,
      message: "must not be reached",
    });

    const result = await processListingImage({
      discovery: discovery([candidate()]),
      prizeCategory: "travel",
      prizeName: "Vacation package",
      http: transport.client,
      storage: null,
    });

    expect(result).toMatchObject({
      finalStatus: "generated_fallback",
      fallbackUrl: "/api/images/listing-fallback/travel",
      retryable: false,
    });
    expect(transport.getAsset).not.toHaveBeenCalled();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      rejectionReason: "media_storage_not_configured",
      storageStatus: "not_attempted",
    }));
  });

  it("fetches, validates, stores, and selects a permitted source image", async () => {
    const bytes = await prizeBytes();
    const transport = http({
      status: "ok",
      url: "https://sponsor.example.com/prize.jpg",
      finalUrl: "https://cdn.sponsor.example.com/prize.jpg",
      bytes,
      contentType: "image/jpeg",
      contentLength: bytes.byteLength,
      etag: null,
      lastModified: null,
      httpStatus: 200,
    });
    const store = vi.fn().mockResolvedValue({
      storedUrl: "https://project.supabase.co/storage/v1/object/public/listing-media/hash.jpg",
      objectPath: "sha256/aa/hash.jpg",
      deduplicated: false,
    });

    const result = await processListingImage({
      discovery: discovery([candidate()]),
      prizeCategory: "travel",
      prizeName: "Vacation package",
      http: transport.client,
      storage: { store },
    });

    expect(result.finalStatus).toBe("source_image");
    expect(result.selected).toMatchObject({
      originalUrl: "https://sponsor.example.com/prize.jpg",
      sourceDomain: "cdn.sponsor.example.com",
      width: 1200,
      height: 630,
      attribution: "Sponsor",
    });
    expect(store).toHaveBeenCalledTimes(1);
    expect(result.retryable).toBe(false);
    expect(result.diagnostics.at(-1)).toMatchObject({ status: "selected", storageStatus: "stored" });
  });

  it("fails closed to a category fallback when image rights are unknown", async () => {
    const transport = http({
      status: "failed",
      url: "https://sponsor.example.com/prize.jpg",
      failure: "network",
      httpStatus: null,
      attempts: 1,
      message: "not expected",
    });
    const unknown = candidate({
      rights: { status: "unknown", licenseUrl: null, attribution: null, reason: "none" },
    });

    const result = await processListingImage({
      discovery: discovery([unknown]),
      prizeCategory: "travel",
      prizeName: "Vacation package",
      http: transport.client,
      storage: { store: vi.fn() },
    });

    expect(result).toMatchObject({
      finalStatus: "generated_fallback",
      fallbackUrl: "/api/images/listing-fallback/travel",
    });
    expect(transport.getAsset).not.toHaveBeenCalled();
    expect(result.retryable).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      status: "rejected",
      rejectionReason: "rights_unconfirmed",
    }));
  });

  it("allows an exact host/operator-authorized URL without broadening other candidates", async () => {
    const bytes = await prizeBytes();
    const transport = http({
      status: "ok",
      url: "https://sponsor.example.com/prize.jpg",
      finalUrl: "https://sponsor.example.com/prize.jpg",
      bytes,
      contentType: "image/jpeg",
      contentLength: bytes.byteLength,
      etag: null,
      lastModified: null,
      httpStatus: 200,
    });
    const unknown = candidate({
      rights: { status: "unknown", licenseUrl: null, attribution: null, reason: "none" },
    });

    const result = await processListingImage({
      discovery: discovery([unknown]),
      prizeCategory: "cash",
      prizeName: "Cash prize",
      http: transport.client,
      storage: {
        store: vi.fn().mockResolvedValue({ storedUrl: "https://media.example/hash.jpg", objectPath: "hash.jpg", deduplicated: true }),
      },
      authorizedUrls: new Set([unknown.url]),
      authorizedAttribution: "Provided by sponsor",
    });

    expect(result.selected).toMatchObject({ attribution: "Provided by sponsor" });
    expect(result.diagnostics.at(-1)).toMatchObject({ storageStatus: "deduplicated" });
  });

  it("tries source imagery before sponsor-logo fallback", async () => {
    const bytes = await prizeBytes();
    const source = candidate({ url: "https://sponsor.example.com/broken.jpg", score: 70 });
    const logo = candidate({
      url: "https://sponsor.example.com/logo.jpg",
      role: "sponsor_logo",
      method: "sponsor_asset",
      score: 120,
    });
    const getAsset = vi.fn()
      .mockResolvedValueOnce({
        status: "failed", url: source.url, failure: "not_found", httpStatus: 404, attempts: 1, message: "404",
      })
      .mockResolvedValueOnce({
        status: "ok", url: logo.url, finalUrl: logo.url, bytes, contentType: "image/jpeg",
        contentLength: bytes.byteLength, etag: null, lastModified: null, httpStatus: 200,
      });
    const client = {
      getAsset,
      get: vi.fn(), resolve: vi.fn(), commitFetchState: vi.fn(),
      stats: vi.fn(() => ({ requests: 0, budget: 10, notModified: 0, failures: 0 })),
    } as unknown as SourceHttpClient;

    const result = await processListingImage({
      discovery: discovery([logo, source]),
      prizeCategory: "other",
      prizeName: "Prize",
      http: client,
      storage: { store: vi.fn().mockResolvedValue({ storedUrl: "https://media/logo.jpg", objectPath: "logo.jpg", deduplicated: false }) },
    });

    expect(getAsset.mock.calls.map(([url]) => url)).toEqual([source.url, logo.url]);
    expect(result.finalStatus).toBe("sponsor_asset");
  });

  it("keeps a storage outage retryable instead of terminalizing the fallback", async () => {
    const bytes = await prizeBytes();
    const transport = http({
      status: "ok",
      url: "https://sponsor.example.com/prize.jpg",
      finalUrl: "https://sponsor.example.com/prize.jpg",
      bytes,
      contentType: "image/jpeg",
      contentLength: bytes.byteLength,
      etag: null,
      lastModified: null,
      httpStatus: 200,
    });

    const result = await processListingImage({
      discovery: discovery([candidate()]),
      prizeCategory: "travel",
      prizeName: "Vacation package",
      http: transport.client,
      storage: { store: vi.fn().mockRejectedValue(new Error("storage unavailable")) },
    });

    expect(result).toMatchObject({ finalStatus: "generated_fallback", retryable: true });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      status: "storage_failed",
      storageStatus: "failed",
    }));
  });

  it("does not extend exact authorization across an unapproved redirect target", async () => {
    const bytes = await prizeBytes();
    const authorized = candidate({
      rights: { status: "unknown", licenseUrl: null, attribution: null, reason: "none" },
    });
    const transport = http({
      status: "ok",
      url: authorized.url,
      finalUrl: "https://unapproved-cdn.example.net/prize.jpg",
      bytes,
      contentType: "image/jpeg",
      contentLength: bytes.byteLength,
      etag: null,
      lastModified: null,
      httpStatus: 200,
    });
    const store = vi.fn();

    const result = await processListingImage({
      discovery: discovery([authorized]),
      prizeCategory: "cash",
      prizeName: "Cash prize",
      http: transport.client,
      storage: { store },
      authorizedUrls: new Set([authorized.url]),
    });

    expect(result).toMatchObject({ finalStatus: "generated_fallback", retryable: false });
    expect(store).not.toHaveBeenCalled();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      rejectionReason: "authorized_redirect_target_not_approved",
      finalUrl: "https://unapproved-cdn.example.net/prize.jpg",
    }));
  });
});

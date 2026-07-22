import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  listingMediaObjectPath,
  validateImageAsset,
} from "@/lib/ingestion/image-validation";

async function raster(
  width = 1200,
  height = 630,
  format: "jpeg" | "png" | "webp" = "jpeg",
): Promise<Uint8Array> {
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs><linearGradient id="g"><stop stop-color="#39114b"/><stop offset="1" stop-color="#f4bd4b"/></linearGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <circle cx="30%" cy="50%" r="18%" fill="#fff" opacity=".35"/>
    </svg>
  `);
  const image = sharp(svg);
  if (format === "png") return image.png().toBuffer();
  if (format === "webp") return image.webp().toBuffer();
  return image.jpeg().toBuffer();
}

describe("validateImageAsset", () => {
  it("confirms the real format, dimensions, size, ratio, and hash", async () => {
    const bytes = await raster();
    const result = await validateImageAsset({ bytes, contentType: "image/jpeg; charset=binary" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.asset).toMatchObject({
        format: "jpeg",
        mimeType: "image/jpeg",
        width: 1200,
        height: 630,
        byteSize: bytes.byteLength,
      });
      expect(result.asset.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(listingMediaObjectPath(result.asset)).toMatch(
        /^sha256\/[a-f0-9]{2}\/[a-f0-9]{64}\.jpg$/,
      );
    }
  });

  it("rejects HTML or arbitrary bytes served as an image", async () => {
    const result = await validateImageAsset({
      bytes: new TextEncoder().encode("<html>not an image</html>"),
      contentType: "image/jpeg",
    });

    expect(result).toMatchObject({ ok: false, failure: "malformed_image" });
  });

  it("rejects a truncated raster even when its header still exposes dimensions", async () => {
    const bytes = await raster();
    const truncated = bytes.slice(0, Math.floor(bytes.byteLength * 0.7));

    await expect(validateImageAsset({
      bytes: truncated,
      contentType: "image/jpeg",
    })).resolves.toMatchObject({ ok: false, failure: "malformed_image" });
  });

  it("rejects effectively invisible transparent artwork", async () => {
    const transparent = await sharp({
      create: {
        width: 1200,
        height: 630,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).png().toBuffer();

    await expect(validateImageAsset({
      bytes: transparent,
      contentType: "image/png",
    })).resolves.toMatchObject({ ok: false, failure: "mostly_transparent" });
  });

  it("rejects a missing or non-image response content type", async () => {
    const bytes = await raster();
    await expect(validateImageAsset({ bytes, contentType: "text/html" })).resolves.toMatchObject({
      ok: false,
      failure: "missing_or_invalid_content_type",
    });
  });

  it("rejects a content type that disagrees with the decoded bytes", async () => {
    const bytes = await raster(1200, 630, "png");
    await expect(validateImageAsset({ bytes, contentType: "image/jpeg" })).resolves.toMatchObject({
      ok: false,
      failure: "content_type_mismatch",
    });
  });

  it("rejects source images and sponsor logos below their role thresholds", async () => {
    const tiny = await raster(120, 60);
    await expect(validateImageAsset({ bytes: tiny, contentType: "image/jpeg" })).resolves.toMatchObject({
      ok: false,
      failure: "dimensions_too_small",
    });
    await expect(validateImageAsset({
      bytes: tiny,
      contentType: "image/jpeg",
      role: "sponsor_logo",
    })).resolves.toMatchObject({ ok: false, failure: "dimensions_too_small" });
  });

  it("rejects SVG as unsupported stored listing media", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"/>');
    await expect(validateImageAsset({ bytes: svg, contentType: "image/svg+xml" })).resolves.toMatchObject({
      ok: false,
      failure: "unsupported_format",
    });
  });

  it("produces the same content hash for duplicate bytes", async () => {
    const bytes = await raster();
    const first = await validateImageAsset({ bytes, contentType: "image/jpeg" });
    const second = await validateImageAsset({ bytes: Uint8Array.from(bytes), contentType: "image/jpeg" });
    expect(first.ok && second.ok && first.asset.contentHash).toBe(
      second.ok ? second.asset.contentHash : "invalid",
    );
  });
});

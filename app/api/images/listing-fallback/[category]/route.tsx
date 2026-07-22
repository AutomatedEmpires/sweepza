import { ImageResponse } from "next/og";
import { listingFallbackTheme } from "@/lib/listing-media";
import { OG_EMBER, OG_GRAPHITE, OG_INK, OG_PAPER } from "@/lib/og-theme";

export const runtime = "edge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ category: string }> },
) {
  const { category } = await params;
  const theme = listingFallbackTheme(category);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          color: OG_INK,
          background: OG_PAPER,
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 520,
            height: 520,
            borderRadius: 520,
            border: `3px solid ${OG_EMBER}`,
            opacity: 0.3,
            right: -120,
            top: -150,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 280,
            height: 280,
            borderRadius: 280,
            background: OG_EMBER,
            opacity: 0.12,
            right: 70,
            bottom: -110,
            display: "flex",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "72px 78px 62px",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 58,
                height: 58,
                borderRadius: 18,
                border: `2px solid ${OG_EMBER}`,
                color: OG_EMBER,
                fontSize: 34,
              }}
            >
              S
            </div>
            <div style={{ display: "flex", fontSize: 31, fontWeight: 800, letterSpacing: 4 }}>
              SWEEPZA
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", maxWidth: 820 }}>
            <div
              style={{
                display: "flex",
                color: OG_EMBER,
                fontSize: 23,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: "uppercase",
              }}
            >
              {theme.eyebrow}
            </div>
            <div style={{ display: "flex", marginTop: 16, fontSize: 76, lineHeight: 1, fontWeight: 800 }}>
              {theme.label}
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 20, color: OG_GRAPHITE }}>
            Sweepza fallback art · source image unavailable for display
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 675,
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
      },
    },
  );
}

import { ImageResponse } from "next/og";
import { getCategoryHub } from "@/lib/category-hubs";
import { APP_NAME, APP_TAGLINE, SITE_URL } from "@/lib/site";

// Per-hub Open Graph card for /discover/{category} — a shared category link
// unfurls with the category's own headline instead of the generic site card.
// Layout and palette mirror app/opengraph-image.tsx (brand tokens pinned as
// hex because satori can't read CSS variables); keep the two files visually
// in sync. Copy rules follow the same canon as the root card and
// lib/category-hubs.ts: the free-to-enter LISTING POLICY and Sweepza's own
// fee may be stated; never assert no-purchase on a sponsor's behalf, never
// promise wins or inventory. Scanned by lib/__tests__/honest-copy.test.ts.
//
// Unknown slugs render the generic tagline card: the page itself 404s during
// the metadata phase, so that image is never referenced — this just keeps the
// image route total.

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface ImageProps {
  params: Promise<{ category: string }>;
}

export async function generateImageMetadata({ params }: ImageProps) {
  const { category } = await params;
  const hub = getCategoryHub(category);
  return [
    {
      id: "og",
      alt: hub ? `${APP_NAME} — ${hub.title}` : `${APP_NAME} — ${APP_TAGLINE}`,
      size,
      contentType,
    },
  ];
}

const PAPER = "#F5F0E7"; // --sun-paper
const INK = "#17130F"; // --sun-ink
const GRAPHITE = "#6E655A"; // --sun-graphite
const EMBER = "#C13E19"; // --sun-ember
const PINE = "#3E6B52"; // --sun-pine

function TrustChip({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        border: `2px solid ${PINE}`,
        borderRadius: 999,
        padding: "10px 22px",
        color: PINE,
        fontSize: 23,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

export default async function HubOpenGraphImage({ params }: ImageProps) {
  const { category } = await params;
  const hub = getCategoryHub(category);
  const headline = hub ? hub.title : APP_TAGLINE;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: PAPER,
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        {/* Ember disc bleeding off the top-right corner, echoing the app icon. */}
        <div
          style={{
            position: "absolute",
            top: -170,
            right: -150,
            width: 520,
            height: 520,
            borderRadius: 520,
            background: EMBER,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -110,
            right: -90,
            width: 400,
            height: 400,
            borderRadius: 400,
            border: `3px solid ${PAPER}`,
            display: "flex",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 72,
          }}
        >
          {/* Wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 16,
                background: EMBER,
                color: PAPER,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 36,
                fontWeight: 800,
              }}
            >
              S
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 42,
                fontWeight: 800,
                color: INK,
                letterSpacing: -1,
              }}
            >
              {APP_NAME}
            </div>
          </div>

          {/* Category headline (smaller than the root card's tagline — hub
              titles run longer and must hold to two lines). */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {hub ? (
              <div
                style={{
                  display: "flex",
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  color: EMBER,
                }}
              >
                Prize category
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                maxWidth: 860,
                fontSize: 58,
                fontWeight: 800,
                lineHeight: 1.08,
                color: INK,
                letterSpacing: -1.5,
              }}
            >
              {headline}
            </div>
          </div>

          {/* Trust line + domain — chips match app/opengraph-image.tsx. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: 14 }}>
              <TrustChip>Free to enter — always</TrustChip>
              <TrustChip>Free for seekers</TrustChip>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 26,
                fontWeight: 600,
                color: GRAPHITE,
              }}
            >
              {SITE_URL.hostname}
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}

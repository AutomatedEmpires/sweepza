import { ImageResponse } from "next/og";
import { APP_NAME, APP_TAGLINE, SITE_URL } from "@/lib/site";

// Site-wide Open Graph card. Applies to every route that doesn't provide its
// own og:image — listing detail pages keep their listing photo because their
// generateMetadata sets openGraph.images, which overrides this file downtree.
// Brand values are the light-theme tokens from app/tokens.css; satori can't
// read CSS variables, so the hex values are pinned here with their names.
// Copy must stay honest: only claims the platform enforces. The free-to-enter
// LISTING POLICY is Sweepza's own editorial commitment and may be stated. Its
// no-purchase claim was NOT policy and nothing enforces it: `no_purchase_necessary`
// is nullable, unchecked by listing_publish_guard(), and absent from both write
// schemas — it is the sponsor's legal representation, not ours. Never assert it
// here, and never make universal rules/verification claims or timing promises.

export const alt = `${APP_NAME} — ${APP_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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

export default function OpenGraphImage() {
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

          {/* Headline */}
          <div
            style={{
              display: "flex",
              maxWidth: 780,
              fontSize: 78,
              fontWeight: 800,
              lineHeight: 1.04,
              color: INK,
              letterSpacing: -2.5,
            }}
          >
            {APP_TAGLINE}
          </div>

          {/* Trust line + domain */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {/* Was: "No purchase necessary" — this card is the social preview for every
                route, so it broadcast a sponsor's legal representation nothing backs. */}
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

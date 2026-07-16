import type { CSSProperties } from "react";
import { ImageResponse } from "next/og";
import { getListingBySlug } from "@/lib/db/listings";
import { APP_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

const OG_CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
const TITLE_LIMIT = 110;

// Current editorial brand tokens from tailwind.config.ts. Satori does not
// evaluate Tailwind classes, so the generated image uses their exact values.
const PAPER = "#f5f0e7";
const INK = "#17130f";
const PINE = "#3e6b52";
const EMBER = "#c13e19";

const containerStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  overflow: "hidden",
  backgroundColor: PAPER,
  padding: "72px 80px",
};

const contentStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

const brandStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  fontSize: 28,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: PINE,
};

const titleStyle: CSSProperties = {
  fontSize: 70,
  fontWeight: 700,
  lineHeight: 1.05,
  letterSpacing: "-0.025em",
  color: INK,
  margin: "28px 0 0",
};

const footerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  color: INK,
};

const prizeStyle: CSSProperties = {
  fontSize: 34,
  fontWeight: 700,
  color: EMBER,
  maxWidth: "65%",
};

const endStyle: CSSProperties = {
  fontSize: 28,
  color: INK,
  opacity: 0.72,
};

function clampTitle(title: string): string {
  if (title.length <= TITLE_LIMIT) return title;
  return `${title.slice(0, TITLE_LIMIT - 1).trimEnd()}…`;
}

function clampPrizeName(prizeName: string): string {
  const limit = 56;
  if (prizeName.length <= limit) return prizeName;
  return `${prizeName.slice(0, limit - 1).trimEnd()}…`;
}

function formatPrize(value: number | undefined, currency?: string): string | null {
  if (value == null || !Number.isFinite(value)) return null;

  try {
    return `${new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 0,
    }).format(value)} prize`;
  } catch {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} prize`;
  }
}

function formatEndDate(endDate: string): string | null {
  const date = new Date(endDate);
  if (Number.isNaN(date.getTime())) return null;

  return `Ends ${date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);

  if (!listing) {
    return new Response("Not found", { status: 404 });
  }

  const prizeText = formatPrize(listing.prizeValue, listing.prizeCurrency);
  const endText = formatEndDate(listing.endDate);

  return new ImageResponse(
    (
      <div style={containerStyle}>
        <div style={contentStyle}>
          <div style={brandStyle}>{APP_NAME}</div>
          <div style={titleStyle}>{clampTitle(listing.title)}</div>
        </div>
        <div style={footerStyle}>
          <div style={prizeStyle}>
            {prizeText ?? clampPrizeName(listing.prizeName)}
          </div>
          {endText ? <div style={endStyle}>{endText}</div> : null}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Cache-Control": OG_CACHE_CONTROL,
      },
    },
  );
}

import type { CSSProperties } from "react";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getListingBySlug } from "@/lib/db/listings";
import { APP_NAME } from "@/lib/site";

// Runs on the Node.js runtime (the default) rather than edge.
//
// `getListingBySlug` resolves through `createServerSupabaseClient` and the
// `server-only` data layer. The task constraints forbid modifying
// `getListingBySlug` or adding a separate DB query, so we cannot swap in
// `createServiceRoleClient` for an edge context. Per the spec this is
// functionally identical to edge (only a slightly slower cold start).

// Exact brand tokens from tailwind.config.ts (Satori has no Tailwind).
const CREAM = "#fbf7f0";
const INK = "#1f1a17";
const MOSS = "#5c7a5a";

const containerStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  backgroundColor: CREAM,
  padding: "80px",
};

const innerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

const brandStyle: CSSProperties = {
  fontSize: 36,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: MOSS,
  margin: 0,
};

const titleStyle: CSSProperties = {
  fontSize: 72,
  fontWeight: 800,
  lineHeight: 1.1,
  color: INK,
  margin: "24px 0 0 0",
};

const prizeStyle: CSSProperties = {
  fontSize: 44,
  fontWeight: 700,
  color: MOSS,
  margin: "32px 0 0 0",
};

const endStyle: CSSProperties = {
  fontSize: 32,
  color: INK,
  opacity: 0.75,
  margin: "16px 0 0 0",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);

  if (!listing) {
    return new Response("Not found", { status: 404 });
  }

  const prizeText =
    typeof listing.prizeValue === "number"
      ? `${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(listing.prizeValue)} prize`
      : null;

  const endText = listing.endDate
    ? `Ends ${new Date(`${listing.endDate}T00:00:00Z`).toLocaleDateString(
        "en-US",
        { month: "long", day: "numeric", year: "numeric" },
      )}`
    : null;

  return new ImageResponse(
    (
      <div style={containerStyle}>
        <div style={innerStyle}>
          <p style={brandStyle}>{APP_NAME}</p>
          <h1 style={titleStyle}>{listing.title}</h1>
          {prizeText ? <p style={prizeStyle}>{prizeText}</p> : null}
          {endText ? <p style={endStyle}>{endText}</p> : null}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}

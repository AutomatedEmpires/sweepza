// Shared visual language for the Open Graph cards (the site-wide card in
// app/opengraph-image.tsx and the per-hub card in
// app/discover/[category]/opengraph-image.tsx). Centralized so the two cards
// cannot drift apart visually or — more importantly — in what they claim.
//
// Brand values are generated from the default Midnight tokens in app/tokens.css.
// Satori cannot read CSS variables, so the build syncs concrete values into a
// typed generated module instead of maintaining a second hand-edited palette.
//
// OG_TRUST_CHIPS is claim copy that travels off-site with every shared link.
// Canon (see app/opengraph-image.tsx history and lib/category-hubs.ts): the
// free-to-enter LISTING POLICY and Sweepza's own fee are Sweepza's to state;
// never assert no-purchase on a sponsor's behalf, never promise wins. This
// file is a scanned surface in lib/__tests__/honest-copy.test.ts.

import { THEME_COLORS } from "@/lib/generated/theme-colors";

export const OG_PAPER = THEME_COLORS.midnight.paper;
export const OG_INK = THEME_COLORS.midnight.ink;
export const OG_GRAPHITE = THEME_COLORS.midnight.graphite;
export const OG_EMBER = THEME_COLORS.midnight.ember;
export const OG_GOLD = THEME_COLORS.midnight.gold;
export const OG_PINE = THEME_COLORS.midnight.pine;

export const OG_TRUST_CHIPS = [
  "Free to enter — always",
  "Free for seekers",
] as const;

export function TrustChip({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        border: `2px solid ${OG_GOLD}`,
        borderRadius: 999,
        padding: "10px 22px",
        color: OG_PINE,
        fontSize: 23,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

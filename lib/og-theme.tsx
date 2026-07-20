// Shared visual language for the Open Graph cards (the site-wide card in
// app/opengraph-image.tsx and the per-hub card in
// app/discover/[category]/opengraph-image.tsx). Centralized so the two cards
// cannot drift apart visually or — more importantly — in what they claim.
//
// Brand values are the light-theme tokens from app/tokens.css; satori can't
// read CSS variables, so the hex values are pinned here with their names.
//
// OG_TRUST_CHIPS is claim copy that travels off-site with every shared link.
// Canon (see app/opengraph-image.tsx history and lib/category-hubs.ts): the
// free-to-enter LISTING POLICY and Sweepza's own fee are Sweepza's to state;
// never assert no-purchase on a sponsor's behalf, never promise wins. This
// file is a scanned surface in lib/__tests__/honest-copy.test.ts.

export const OG_PAPER = "#F5F0E7"; // --sun-paper
export const OG_INK = "#17130F"; // --sun-ink
export const OG_GRAPHITE = "#6E655A"; // --sun-graphite
export const OG_EMBER = "#C13E19"; // --sun-ember
export const OG_PINE = "#3E6B52"; // --sun-pine

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
        border: `2px solid ${OG_PINE}`,
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

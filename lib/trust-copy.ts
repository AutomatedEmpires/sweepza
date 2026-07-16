import type { IconName } from "@/components/icon";

// Homepage trust band — one source of truth so tests can hold this copy to
// what the platform actually enforces. Each claim maps to a hard mechanism:
//  - free-to-enter is the directory's listing policy (terms + FAQ canon);
//  - "reviewed before it goes live" is enforced at the public serving
//    boundary: lib/db/listings.ts only returns rows whose
//    listing_verification_status is reviewed/verified, so a row a human has
//    not accepted can never render on a public surface;
//  - "you enter on the host's site" is structural: Sweepza never collects
//    entries — the Enter action opens the listing's external entry_url.
// Never claim more than these mechanisms deliver: published listings may
// carry a documented official-rules exception, hosts may be unverified, and
// nothing verifies that an entry URL is sponsor-owned — so universal rules
// claims, blanket "verified hosts" claims, and "sponsor's official page"
// framing are banned (see lib/__tests__/honest-copy.test.ts).

export interface TrustBandItem {
  icon: IconName;
  label: string;
}

export const TRUST_BAND_ITEMS: TrustBandItem[] = [
  { icon: "shield", label: "Free to enter — always" },
  { icon: "verified", label: "Every listing reviewed before it goes live" },
  { icon: "rules", label: "You enter on the host's site, never here" },
];

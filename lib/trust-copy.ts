import type { IconName } from "@/components/icon";

// Homepage trust band — one source of truth so tests can hold this copy to
// what the platform actually enforces. Each claim maps to a hard mechanism:
//  - free-to-enter is the directory's listing policy (terms + FAQ canon);
//  - review is the admin approval gate every host-submitted listing passes
//    before it turns public (admin imports are team-created), backed by the
//    DB publish guard;
//  - the entry link is required by the publish guard and always points at the
//    sponsor's own entry experience — entries never happen on Sweepza.
// Never claim more than these mechanisms deliver: published listings may
// carry a documented official-rules exception, and hosts may be unverified,
// so "official rules on every listing" and blanket "verified hosts" claims
// are banned (see lib/__tests__/honest-copy.test.ts).

export interface TrustBandItem {
  icon: IconName;
  label: string;
}

export const TRUST_BAND_ITEMS: TrustBandItem[] = [
  { icon: "shield", label: "Free to enter — always" },
  { icon: "verified", label: "Every listing reviewed before it goes live" },
  { icon: "rules", label: "Enter on the sponsor's official page" },
];

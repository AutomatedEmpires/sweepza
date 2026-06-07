import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { getHostByAppUserId } from "./hosts";
import type { HostRow, ListingRow, SubscriptionRow } from "./types";

type HostListingDashboardRow = Pick<
  ListingRow,
  | "id"
  | "slug"
  | "title"
  | "lifecycle_status"
  | "visibility_status"
  | "published_at"
  | "updated_at"
  | "end_date"
>;

export interface HostDashboardSnapshot {
  host: HostRow | null;
  subscription: SubscriptionRow | null;
  recentListings: HostListingDashboardRow[];
  counts: {
    total: number;
    active: number;
    draft: number;
    public: number;
    endingSoon: number;
  };
}

const ENDING_SOON_DAYS = 7;

function isEndingSoon(endDate: string | null): boolean {
  if (!endDate) return false;

  const today = new Date();
  const end = new Date(`${endDate}T00:00:00Z`);
  const diffMs = end.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return diffDays >= 0 && diffDays <= ENDING_SOON_DAYS;
}

export async function getHostDashboardSnapshotForAppUser(
  appUserId: string,
): Promise<HostDashboardSnapshot> {
  const supabase = createServiceRoleClient();
  const host = await getHostByAppUserId(appUserId);

  if (!host) {
    return {
      host: null,
      subscription: null,
      recentListings: [],
      counts: { total: 0, active: 0, draft: 0, public: 0, endingSoon: 0 },
    };
  }

  const [subscriptionResult, listingsResult] = await Promise.all([
    supabase
      .from("subscription")
      .select("*")
      .eq("host_id", host.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<SubscriptionRow[]>(),
    supabase
      .from("listing")
      .select(
        "id, slug, title, lifecycle_status, visibility_status, published_at, updated_at, end_date",
      )
      .eq("host_id", host.id)
      .order("updated_at", { ascending: false })
      .returns<HostListingDashboardRow[]>(),
  ]);

  if (subscriptionResult.error) {
    throw new Error(
      `getHostDashboardSnapshotForAppUser subscription lookup failed: ${subscriptionResult.error.message}`,
    );
  }

  if (listingsResult.error) {
    throw new Error(
      `getHostDashboardSnapshotForAppUser listing lookup failed: ${listingsResult.error.message}`,
    );
  }

  const subscription = subscriptionResult.data?.[0] ?? null;
  const listings = listingsResult.data ?? [];

  return {
    host,
    subscription,
    recentListings: listings.slice(0, 6),
    counts: {
      total: listings.length,
      active: listings.filter((listing) => listing.lifecycle_status === "active").length,
      draft: listings.filter((listing) => listing.lifecycle_status === "draft").length,
      public: listings.filter((listing) => listing.visibility_status === "public").length,
      endingSoon: listings.filter((listing) => isEndingSoon(listing.end_date)).length,
    },
  };
}

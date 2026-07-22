import { daysUntil, isExpired, listingExpiration } from "@/lib/listing-badges";
import type { Listing } from "@/lib/types/listing";

// Shared presentational formatters for listing surfaces (card + detail).
// Pure and framework-agnostic so server and client components can both use
// them. Badge and urgency logic lives in lib/listing-badges.

export const ENTRY_FREQUENCY_LABEL: Record<Listing["entryFrequency"], string> = {
  one_time: "One-time entry",
  daily: "Daily entry",
  weekly: "Weekly entry",
  monthly: "Monthly entry",
  instant_win: "Instant win",
  other: "See rules",
};

export function formatEndDate(endDate: string): string {
  // Postgres `date` values are calendar facts, not instants. Formatting
  // YYYY-MM-DD in the browser's local timezone shifts UTC midnight to the
  // previous day west of Greenwich and makes SSR disagree with hydration.
  const dateOnly = endDate.slice(0, 10);
  return new Date(`${dateOnly}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function endDateLabel(listing: Listing): string {
  if (isExpired(listing)) return `Ended ${formatEndDate(listing.endDate)}`;
  const expiry = listingExpiration(listing.endDate);
  const days = daysUntil(listing.endDate);
  if (expiry.state === "ends_today") return "Ends today";
  if (days <= 3) return "Ends soon";
  if (days <= 14) return `Ends in ${days} days`;
  return `Ends ${formatEndDate(listing.endDate)}`;
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = now.getTime() - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatEndDate(iso);
}

export function formatPrizeValue(
  value?: number,
  currency = "USD",
): string | null {
  if (value == null) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${value}`;
  }
}

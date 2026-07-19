import { SweepsNotFound } from "@/components/sweeps-not-found";

// Segment-level 404 for /sweeps/[slug]: expired, removed, and mistyped
// listing links land here instead of the generic site 404, and get routed
// back into live inventory. Middleware owns the pre-stream hard-404 check;
// this segment fallback covers client transitions and availability races.
export default function ListingNotFound() {
  return <SweepsNotFound />;
}

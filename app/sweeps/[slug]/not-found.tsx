import { SweepsNotFound } from "@/components/sweeps-not-found";

// Segment-level 404 for /sweeps/[slug]: expired, removed, and mistyped
// listing links land here (the page and its metadata call notFound() when no
// public row resolves) instead of the generic site 404, and get routed back
// into live inventory. Status stays 404, so dead links drop from indexes.
export default function ListingNotFound() {
  return <SweepsNotFound />;
}

import { SweepsNotFound } from "@/components/sweeps-not-found";

// Segment-level 404 for /sweeps/[slug]: expired, removed, and mistyped
// listing links land here instead of the generic site 404, and get routed
// back into live inventory. generateMetadata calls notFound() when no public
// row resolves — during the metadata phase, before the streaming response
// commits — so the HTTP status is a real 404 and dead links drop from
// indexes (a page-body-only notFound() would stream inside an already-sent
// 200 because of the root loading boundary).
export default function ListingNotFound() {
  return <SweepsNotFound />;
}

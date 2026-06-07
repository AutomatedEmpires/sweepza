import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The host submission review queue now lives under the consolidated listings page.
export default function AdminReviewRedirectPage() {
  redirect("/admin/listings?tab=review");
}

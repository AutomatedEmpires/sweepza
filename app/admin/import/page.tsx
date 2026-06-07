import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The manual import flow now lives under the consolidated listings page.
export default function AdminImportRedirectPage() {
  redirect("/admin/listings?tab=import");
}

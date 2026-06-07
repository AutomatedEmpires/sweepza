import Link from "next/link";
import { HostLogoUploader } from "@/components/host-logo-uploader";
import { getHostIdentity } from "@/lib/db/host-dashboard";

export const dynamic = "force-dynamic";

export default async function HostSettingsPage() {
  const { host } = await getHostIdentity();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Host Settings</h1>
        <Link href="/host" className="text-sm text-indigo-600 hover:underline">Back to dashboard</Link>
      </div>

      <section className="rounded-lg border border-gray-200 p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-medium text-gray-800">Logo</h2>
        <HostLogoUploader initialLogoUrl={host.logo_url} />
      </section>
    </div>
  );
}

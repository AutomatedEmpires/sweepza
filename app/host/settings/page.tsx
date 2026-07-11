import Link from "next/link";
import { HostLogoUploader } from "@/components/host-logo-uploader";
import { getHostIdentity } from "@/lib/db/host-dashboard";

export const dynamic = "force-dynamic";

export default async function HostSettingsPage() {
  const { host } = await getHostIdentity();

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 pt-8">
      <header className="mb-6 flex items-start justify-between gap-3 px-1">
        <h1 className="font-display text-3xl text-ink">Host settings</h1>
        <Link
          href="/host"
          className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-line px-3.5 py-2 text-xs font-semibold text-ink/75 transition hover:bg-paper"
        >
          Dashboard
        </Link>
      </header>

      <section className="rounded-card border border-line bg-surface p-4 shadow-e1">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-graphite">Logo</h2>
        <HostLogoUploader initialLogoUrl={host.logo_url} />
      </section>
    </div>
  );
}

import Link from "next/link";
import HostLogoUploader from "@/components/host-logo-uploader";

export const metadata = { title: "Host Settings" };

export default function HostSettingsPage() {
  return (
    <section className="px-5 pt-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Profile</h1>
          <p className="mt-2 text-sm text-ink/60">Update your logo.</p>
        </div>
        <Link className="text-sm font-medium text-accent" href="/host">
          Back
        </Link>
      </header>

      <div className="mt-6">
        <HostLogoUploader />
      </div>
    </section>
  );
}

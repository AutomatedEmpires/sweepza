import Link from "next/link";
import { getNotificationPrefs } from "@/lib/db/host-dashboard";
import { updateNotificationPrefsAction } from "./actions";

export const metadata = { title: "Host Notifications" };

function PrefToggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-ink/10 bg-white p-4">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input className="h-5 w-5" type="checkbox" name={name} defaultChecked={defaultChecked} role="switch" aria-checked={defaultChecked} />
    </label>
  );
}

export default async function HostNotificationsPage() {
  const prefs = await getNotificationPrefs();
  return (
    <section className="px-5 pt-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Notifications</h1>
          <p className="mt-2 text-sm text-ink/60">Choose the host updates you want by email.</p>
        </div>
        <Link className="text-sm font-medium text-accent" href="/host">Back</Link>
      </header>
      <form action={updateNotificationPrefsAction} className="mt-6 grid gap-3">
        <PrefToggle name="email_on_listing_approved" label="Listing approved" defaultChecked={prefs.email_on_listing_approved} />
        <PrefToggle name="email_on_listing_held" label="Listing held for review" defaultChecked={prefs.email_on_listing_held} />
        <PrefToggle name="email_on_listing_expiring_soon" label="Listing expiring soon" defaultChecked={prefs.email_on_listing_expiring_soon} />
        <PrefToggle name="email_on_new_reaction" label="New reaction" defaultChecked={prefs.email_on_new_reaction} />
        <button className="mt-2 h-11 rounded-xl bg-accent text-sm font-semibold text-white">Save preferences</button>
      </form>
    </section>
  );
}

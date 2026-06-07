import Link from "next/link";
import { getNotificationPrefs, updateNotificationPrefs } from "@/lib/db/host-dashboard";

export const metadata = { title: "Host Notifications" };

function PrefToggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-ink/10 bg-white p-4">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        className="h-5 w-5"
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        role="switch"
        aria-checked={defaultChecked}
      />
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
          <p className="mt-2 text-sm text-ink/60">Choose what emails and in-app alerts you want.</p>
        </div>
        <Link className="text-sm font-medium text-accent" href="/host">
          Back
        </Link>
      </header>

      <form action={updateNotificationPrefs} className="mt-6 grid gap-3">
        <PrefToggle name="ends_today" label="Listings ending today" defaultChecked={prefs.ends_today} />
        <PrefToggle name="ends_soon" label="Listings ending soon" defaultChecked={prefs.ends_soon} />
        <PrefToggle name="saved_listing_ending" label="Saved listing ending" defaultChecked={prefs.saved_listing_ending} />
        <PrefToggle name="winner_wall_reactions" label="Winner Wall reactions" defaultChecked={prefs.winner_wall_reactions} />
        <PrefToggle name="weekly_roundup" label="Weekly roundup" defaultChecked={prefs.weekly_roundup} />

        <button className="mt-2 h-11 rounded-xl bg-accent text-sm font-semibold text-white">
          Save preferences
        </button>
      </form>
    </section>
  );
}

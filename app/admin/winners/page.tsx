import "server-only";

import { revalidatePath } from "next/cache";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { WinnerPostRow } from "@/lib/db/types";

export const metadata = {
  title: "Admin · Winner Wall",
};

async function update(id: string, patch: Partial<WinnerPostRow>) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("winner_post").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/winners");
}

export default async function AdminWinnersPage() {
  // TODO(Lane B): enforce is_admin/is_owner via ensureCurrentAppUser().
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("winner_post")
    .select("*")
    .in("review_status", ["submitted", "pending_review"])
    .order("created_at", { ascending: true })
    .returns<WinnerPostRow[]>();

  if (error) throw new Error(error.message);
  const rows = data ?? [];

  return (
    <section className="px-4 pb-10 pt-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-ink">Winner Wall moderation</h1>
        <p className="text-sm text-ink/60">Review submitted wins before they appear publicly.</p>
      </header>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-ink/60">No submissions pending review.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {rows.map((row) => (
            <form
              key={row.id}
              className="rounded-card border border-sand bg-white p-4"
              action={async (formData) => {
                "use server";
                const action = String(formData.get("action") ?? "");
                if (action === "publish") {
                  await update(row.id, { review_status: "published" });
                  return;
                }
                if (action === "hide") {
                  await update(row.id, { review_status: "hidden" });
                  return;
                }
                if (action === "reject") {
                  await update(row.id, { review_status: "rejected" });
                }
              }}
            >
              <p className="text-xs text-ink/50">{row.created_at}</p>
              <p className="mt-2 text-sm text-ink/80">{row.caption}</p>
              {row.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.photo_url}
                  alt=""
                  className="mt-3 w-full rounded-2xl border border-sand object-cover"
                />
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  name="action"
                  value="publish"
                  className="rounded-xl bg-moss px-3 py-2 text-xs font-semibold text-cream"
                >
                  Publish
                </button>
                <button
                  name="action"
                  value="hide"
                  className="rounded-xl bg-ink/70 px-3 py-2 text-xs font-semibold text-cream"
                >
                  Hide
                </button>
                <button
                  name="action"
                  value="reject"
                  className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  Reject
                </button>
              </div>
            </form>
          ))}
        </div>
      )}
    </section>
  );
}

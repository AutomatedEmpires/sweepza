import Link from "next/link";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getNavBadgeCounts } from "@/lib/db/admin";

export const dynamic = "force-dynamic";

function AdminGateNotice({
  title,
  description,
  showSignIn = false,
}: {
  title: string;
  description: string;
  showSignIn?: boolean;
}) {
  return (
    <div className="min-h-screen bg-paper">
      <section className="px-5 pb-10 pt-8">
        <div className="mx-auto max-w-xl rounded-card border border-line bg-surface p-6 shadow-e1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
            Admin
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-graphite">
            {description}
          </p>
          <div className="mt-4 flex items-center gap-2">
            {showSignIn ? (
              <Link
                href="/sign-in"
                className="rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90"
              >
                Sign in
              </Link>
            ) : null}
            <Link
              href="/"
              className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink/75 transition hover:bg-paper"
            >
              Back to home
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (!isClerkConfigured()) {
    return (
      <AdminGateNotice
        title="Admin unavailable"
        description="Clerk is not configured in this environment yet, so admin identity cannot be verified."
      />
    );
  }

  const authUser = await ensureCurrentAppUser();

  if (!authUser) {
    return (
      <AdminGateNotice
        title="Sign in required"
        description="The Sweepza admin command center is only available to authenticated admins or owners."
        showSignIn
      />
    );
  }

  if (!authUser.appUser.is_admin && !authUser.appUser.is_owner) {
    return (
      <AdminGateNotice
        title="403 — Admin access required"
        description="Your account doesn't have admin or owner access to the Sweepza command center."
      />
    );
  }

  const counts = await getNavBadgeCounts();

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col md:flex-row">
        <AdminNav counts={counts} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

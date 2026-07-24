import "server-only";

import { cookies } from "next/headers";

/**
 * Dev-only auth bypass so gated (admin / host) surfaces can be demonstrated on
 * localhost without a Clerk instance.
 *
 * FAIL-CLOSED IN PRODUCTION by three independent conditions — ALL must hold, so
 * it can never activate on a deployed build:
 *   1) NODE_ENV !== "production"
 *   2) not running on Vercel (VERCEL is set on every Vercel build & runtime)
 *   3) explicit opt-in SWEEPZA_DEV_AUTH === "1"
 *
 * The impersonated identity is always a SEEDED local app_user, resolved by the
 * exact clerk_user_id the local seeds create — it never fabricates a privileged
 * row. When disabled, resolveDevAuthClerkId() returns before it even reads a
 * cookie, so production behavior is completely unchanged.
 */

export const DEV_AUTH_COOKIE = "sweepza_dev_role";
export type DevAuthRole = "admin" | "host";

export function isDevAuthEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL &&
    process.env.SWEEPZA_DEV_AUTH === "1"
  );
}

// Dev role → the clerk_user_id created by the local seeds:
//   admin -> supabase/seed.sql owner/admin user ('dev_owner')
//   host  -> scripts/seed-dev-listings.mjs demo host ('dev-seed-host')
const ROLE_CLERK_ID: Record<DevAuthRole, string> = {
  admin: "dev_owner",
  host: "dev-seed-host",
};

export function isDevAuthRole(value: string | null | undefined): value is DevAuthRole {
  return value === "admin" || value === "host";
}

export function devAuthClerkId(role: DevAuthRole): string {
  return ROLE_CLERK_ID[role];
}

/**
 * The clerk_user_id to impersonate for this request, or null when dev-auth is
 * off or no valid role cookie is set.
 */
export async function resolveDevAuthClerkId(): Promise<string | null> {
  if (!isDevAuthEnabled()) return null;
  const role = (await cookies()).get(DEV_AUTH_COOKIE)?.value;
  if (!isDevAuthRole(role)) return null;
  return devAuthClerkId(role);
}

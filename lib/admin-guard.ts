import "server-only";

import { ensureCurrentAppUser } from "@/lib/auth";

export type AdminGuardResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; message: string };

// Shared gate for admin API routes. API routes live outside app/admin and are
// therefore NOT covered by the admin layout gate, so each one must call this.
export async function requireAdminApi(): Promise<AdminGuardResult> {
  const authUser = await ensureCurrentAppUser();
  if (!authUser) {
    return { ok: false, status: 401, message: "Authentication required." };
  }
  if (!authUser.appUser.is_admin && !authUser.appUser.is_owner) {
    return { ok: false, status: 403, message: "Admin access required." };
  }
  return { ok: true };
}

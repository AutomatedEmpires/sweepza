import { NextResponse, type NextRequest } from "next/server";

import { DEV_AUTH_COOKIE, isDevAuthEnabled, isDevAuthRole } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

/**
 * Dev-only helper to impersonate a seeded admin/host for local demos of gated
 * surfaces. 404s entirely unless the three dev-auth guards hold (see
 * lib/dev-auth.ts), so it does not exist on any deployed build.
 *
 *   GET /api/dev/impersonate?role=admin&to=/admin
 *   GET /api/dev/impersonate?role=host&to=/host
 *   GET /api/dev/impersonate?role=clear&to=/
 */
export async function GET(request: NextRequest) {
  if (!isDevAuthEnabled()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const role = url.searchParams.get("role");
  // Same-origin redirect only — never follow an absolute/off-site target.
  const rawTo = url.searchParams.get("to") ?? "/";
  const to = rawTo.startsWith("/") && !rawTo.startsWith("//") ? rawTo : "/";
  const response = NextResponse.redirect(new URL(to, url.origin));

  if (role === "clear") {
    response.cookies.delete(DEV_AUTH_COOKIE);
    return response;
  }
  if (!isDevAuthRole(role)) {
    return new NextResponse("Invalid role (use admin | host | clear)", { status: 400 });
  }

  response.cookies.set(DEV_AUTH_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return response;
}

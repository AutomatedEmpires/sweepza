import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import type { AppUserRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/server";

type ClerkUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

export interface SweepzaAuthUser {
  clerkUserId: string;
  appUserId: string;
  email: string | null;
  displayName: string | null;
}

export function isClerkConfigured(): boolean {
  return Boolean(
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY,
  );
}

function getUserEmail(user: ClerkUser): string | null {
  return (
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    null
  );
}

function getUserDisplayName(user: ClerkUser, email: string | null): string | null {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (user.username) return user.username;
  return email ? email.split("@")[0] : null;
}

export async function ensureCurrentAppUser(): Promise<SweepzaAuthUser | null> {
  if (!isClerkConfigured()) return null;

  const authState = await auth();
  if (!authState.userId) return null;

  const user = await currentUser();
  if (!user) return null;

  const email = getUserEmail(user);
  const displayName = getUserDisplayName(user, email);
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("app_user")
    .upsert(
      {
        clerk_user_id: user.id,
        email,
        display_name: displayName,
        is_seeker: true,
      },
      { onConflict: "clerk_user_id" },
    )
    .select("*")
    .single<AppUserRow>();

  if (error) {
    throw new Error(`ensureCurrentAppUser failed: ${error.message}`);
  }

  return {
    clerkUserId: data.clerk_user_id,
    appUserId: data.id,
    email: data.email,
    displayName: data.display_name,
  };
}

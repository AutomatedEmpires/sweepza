import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import type { AppUserRow } from "@/lib/db/types";
import { env } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/server";

type ClerkUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;
type ClerkEmailAddress = { email_address?: string | null } | null | undefined;

export interface ClerkUserSyncPayload {
  emailAddresses?: ClerkEmailAddress[];
  firstName?: string | null;
  id: string;
  lastName?: string | null;
  primaryEmailAddressId?: string | null;
  username?: string | null;
}

export interface SweepzaAuthUser {
  clerkUserId: string;
  appUserId: string;
  email: string | null;
  displayName: string | null;
  appUser: AppUserRow;
}

export function isClerkConfigured(): boolean {
  return Boolean(
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && env.CLERK_SECRET_KEY,
  );
}

function getPrimaryEmailAddress(
  user: ClerkUserSyncPayload,
): string | null {
  const addresses = user.emailAddresses ?? [];
  if (addresses.length === 0) return null;

  if (user.primaryEmailAddressId) {
    const primary = addresses.find(
      (address) =>
        typeof address === "object" &&
        address !== null &&
        "id" in address &&
        address.id === user.primaryEmailAddressId,
    ) as { email_address?: string | null } | undefined;

    if (primary?.email_address) {
      return primary.email_address;
    }
  }

  const first = addresses.find(
    (address): address is { email_address?: string | null } =>
      Boolean(address && typeof address === "object"),
  );

  return first?.email_address ?? null;
}

function getUserEmail(user: ClerkUser): string | null {
  return getPrimaryEmailAddress({
    id: user.id,
    primaryEmailAddressId: user.primaryEmailAddressId,
    emailAddresses: user.emailAddresses.map((address) => ({
      id: address.id,
      email_address: address.emailAddress,
    })),
  });
}

function getUserDisplayName(
  user: Pick<ClerkUserSyncPayload, "firstName" | "lastName" | "username">,
  email: string | null,
): string | null {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (user.username) return user.username;
  return email ? email.split("@")[0] : null;
}

export async function syncAppUserFromClerkPayload(
  payload: ClerkUserSyncPayload,
): Promise<AppUserRow> {
  const email = getPrimaryEmailAddress(payload);
  const displayName = getUserDisplayName(payload, email);
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("app_user")
    .upsert(
      {
        clerk_user_id: payload.id,
        email,
        display_name: displayName,
        is_seeker: true,
      },
      { onConflict: "clerk_user_id" },
    )
    .select("*")
    .single<AppUserRow>();

  if (error) {
    throw new Error(`syncAppUserFromClerkPayload failed: ${error.message}`);
  }

  return data;
}

export async function deleteAppUserByClerkId(clerkUserId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("app_user")
    .delete()
    .eq("clerk_user_id", clerkUserId);

  if (error) {
    throw new Error(`deleteAppUserByClerkId failed: ${error.message}`);
  }
}

export async function ensureCurrentAppUser(): Promise<SweepzaAuthUser | null> {
  if (!isClerkConfigured()) return null;

  const authState = await auth();
  if (!authState.userId) return null;

  const user = await currentUser();
  if (!user) return null;

  const appUser = await syncAppUserFromClerkPayload({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    primaryEmailAddressId: user.primaryEmailAddressId,
    emailAddresses: user.emailAddresses.map((address) => ({
      id: address.id,
      email_address: address.emailAddress,
    })),
  });

  return {
    clerkUserId: appUser.clerk_user_id,
    appUserId: appUser.id,
    email: appUser.email,
    displayName: appUser.display_name,
    appUser,
  };
}

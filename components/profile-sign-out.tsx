"use client";

import { SignOutButton } from "@clerk/nextjs";
import { Icon } from "@/components/icon";

export function ProfileSignOut() {
  return (
    <SignOutButton redirectUrl="/">
      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-full border border-sand px-4 py-2.5 text-sm font-semibold text-ink/70 transition hover:bg-ink/5"
      >
        <Icon name="signOut" size={16} /> Sign out
      </button>
    </SignOutButton>
  );
}

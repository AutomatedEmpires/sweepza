"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export interface HostProfileFormValues {
  display_name: string;
  website_url: string | null;
  short_description: string | null;
  logo_url: string | null;
}

export function HostProfileForm({
  initialProfile,
  mode,
}: {
  initialProfile?: HostProfileFormValues | null;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; saved?: boolean }>({});

  function submit(formData: FormData) {
    const payload = {
      displayName: String(formData.get("displayName") ?? "").trim(),
      websiteUrl: formData.get("websiteUrl")
        ? String(formData.get("websiteUrl")).trim()
        : null,
      shortDescription: formData.get("shortDescription")
        ? String(formData.get("shortDescription")).trim()
        : null,
      logoUrl: formData.get("logoUrl")
        ? String(formData.get("logoUrl")).trim()
        : null,
    };

    startTransition(async () => {
      setResult({});

      try {
        const response = await fetch("/api/host/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        if (!response.ok) {
          setResult({ error: body?.error ?? `Request failed (${response.status})` });
          return;
        }

        setResult({ saved: true });
        router.refresh();
      } catch (error) {
        setResult({
          error:
            error instanceof Error ? error.message : "Host profile save failed.",
        });
      }
    });
  }

  return (
    <form
      action={submit}
      className="flex flex-col gap-4 rounded-card border border-sand bg-white/80 p-4"
    >
      <div>
        <h2 className="text-sm font-semibold text-ink">
          {mode === "create" ? "Create your host profile" : "Edit host profile"}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink/65">
          {mode === "create"
            ? "Set up your public host identity so you can submit listings to Sweepza."
            : "Update the public details Sweepza shows for your host identity."}
        </p>
      </div>

      <div className="grid gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Display name</span>
          <input
            name="displayName"
            required
            minLength={2}
            maxLength={80}
            defaultValue={initialProfile?.display_name ?? ""}
            className="rounded-xl border border-sand bg-cream px-3 py-2 text-ink outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Website URL</span>
          <input
            name="websiteUrl"
            type="url"
            defaultValue={initialProfile?.website_url ?? ""}
            placeholder="https://example.com"
            className="rounded-xl border border-sand bg-cream px-3 py-2 text-ink outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Short description</span>
          <textarea
            name="shortDescription"
            rows={3}
            maxLength={300}
            defaultValue={initialProfile?.short_description ?? ""}
            className="rounded-xl border border-sand bg-cream px-3 py-2 text-ink outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Logo URL</span>
          <input
            name="logoUrl"
            type="url"
            defaultValue={initialProfile?.logo_url ?? ""}
            placeholder="https://example.com/logo.png"
            className="rounded-xl border border-sand bg-cream px-3 py-2 text-ink outline-none"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-cream transition hover:bg-moss/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending
            ? "Saving..."
            : mode === "create"
              ? "Create host profile"
              : "Save changes"}
        </button>
        <p className="text-xs text-ink/50">
          Your profile is public to seekers browsing host listings.
        </p>
      </div>

      {result.error ? (
        <p className="rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember">
          {result.error}
        </p>
      ) : null}

      {result.saved ? (
        <p className="rounded-xl border border-moss/30 bg-moss/10 px-3 py-2 text-sm text-moss">
          Host profile saved.
        </p>
      ) : null}
    </form>
  );
}

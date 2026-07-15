"use client";

import { useState, useTransition } from "react";
import type { EntryFrequency } from "@/lib/db/enums";
import type { DictionaryOption } from "@/lib/db/dictionaries";

const ENTRY_OPTIONS: Array<{ value: EntryFrequency; label: string }> = [
  { value: "one_time", label: "One time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "instant_win", label: "Instant win" },
  { value: "other", label: "Other" },
];

export function HostListingSubmissionForm({
  categories,
  tags,
}: {
  categories: DictionaryOption[];
  tags: DictionaryOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    error?: string;
    slug?: string;
    url?: string;
  }>({});

  function submit(formData: FormData) {
    const payload = {
      title: String(formData.get("title") ?? ""),
      shortDescription: String(formData.get("shortDescription") ?? ""),
      prizeName: String(formData.get("prizeName") ?? ""),
      prizeValue: formData.get("prizeValue")
        ? Number(formData.get("prizeValue"))
        : null,
      prizeCategory: String(formData.get("prizeCategory") ?? ""),
      mainImageUrl: formData.get("mainImageUrl")
        ? String(formData.get("mainImageUrl"))
        : null,
      imageAltText: formData.get("imageAltText")
        ? String(formData.get("imageAltText"))
        : null,
      entryUrl: String(formData.get("entryUrl") ?? ""),
      officialRulesUrl: String(formData.get("officialRulesUrl") ?? ""),
      endDate: String(formData.get("endDate") ?? ""),
      entryFrequency: String(formData.get("entryFrequency") ?? ""),
      eligibilityCountry: String(formData.get("eligibilityCountry") ?? ""),
      sponsorName: formData.get("sponsorName")
        ? String(formData.get("sponsorName"))
        : null,
      tagCodes: formData.getAll("tagCodes").map(String),
    };

    startTransition(async () => {
      setResult({});

      try {
        const response = await fetch("/api/host/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const body = (await response.json().catch(() => null)) as
          | { error?: string; slug?: string; url?: string }
          | null;

        if (!response.ok) {
          setResult({ error: body?.error ?? `Request failed (${response.status})` });
          return;
        }

        setResult({
          slug: body?.slug,
          url: body?.url,
        });
      } catch (error) {
        setResult({
          error:
            error instanceof Error ? error.message : "Listing submission failed.",
        });
      }
    });
  }

  return (
    <form
      action={submit}
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-e1"
    >
      <div>
        <h2 className="text-sm font-semibold text-ink">Submit a listing</h2>
        <p className="mt-1 text-sm leading-relaxed text-graphite">
          New host listings start as private drafts so Sweepza can review them
          before they go live.
        </p>
      </div>

      <div className="grid gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Title</span>
          <input
            name="title"
            required
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Short description</span>
          <textarea
            name="shortDescription"
            required
            rows={3}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Prize name</span>
            <input
              name="prizeName"
              required
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Prize value (USD)</span>
            <input
              name="prizeValue"
              type="number"
              min="0"
              step="1"
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Category</span>
            <select
              name="prizeCategory"
              required
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
            >
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category.code} value={category.code}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Entry frequency</span>
            <select
              name="entryFrequency"
              defaultValue="one_time"
              required
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
            >
              {ENTRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Entry URL</span>
            <input
              name="entryUrl"
              type="url"
              required
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Official rules URL</span>
            <input
              name="officialRulesUrl"
              type="url"
              required
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">End date</span>
            <input
              name="endDate"
              type="date"
              required
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Eligibility country</span>
            <input
              name="eligibilityCountry"
              defaultValue="US"
              required
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Main image URL</span>
            <input
              name="mainImageUrl"
              type="url"
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Image alt text</span>
            <input
              name="imageAltText"
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Sponsor name</span>
            <input
              name="sponsorName"
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
            />
          </label>

          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="font-medium text-ink">Tags</legend>
            <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-line bg-paper p-3">
              {tags.map((tag) => (
                <label
                  key={tag.code}
                  className="flex items-center gap-2 text-xs text-ink/75"
                >
                  <input type="checkbox" name="tagCodes" value={tag.code} className="text-pine focus:ring-pine" />
                  <span>{tag.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Submitting..." : "Create draft listing"}
        </button>
        <p className="text-xs text-graphite">
          Drafts stay private until Sweepza reviews and publishes them.
        </p>
      </div>

      {result.error ? (
        <p className="rounded-xl border border-flame/30 bg-flame/10 px-3 py-2 text-sm text-flame">
          {result.error}
        </p>
      ) : null}

      {result.slug ? (
        <div className="rounded-xl border border-pine/30 bg-pine/10 px-3 py-2 text-sm text-pine">
          Listing saved as draft:{" "}
          <a href={result.url} className="font-semibold underline">
            {result.slug}
          </a>
        </div>
      ) : null}
    </form>
  );
}

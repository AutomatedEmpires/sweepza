"use client";

import { useState, useTransition } from "react";
import type { EntryFrequency, SourceLabel } from "@/lib/db/enums";
import type { DictionaryOption } from "@/lib/db/dictionaries";

const ENTRY_OPTIONS: Array<{ value: EntryFrequency; label: string }> = [
  { value: "one_time", label: "One time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "instant_win", label: "Instant win" },
  { value: "other", label: "Other" },
];

const SOURCE_OPTIONS: Array<{ value: SourceLabel; label: string }> = [
  { value: "found_by_sweepza", label: "Found by Sweepza" },
  { value: "host_submitted", label: "Host submitted" },
  { value: "claimed_by_host", label: "Claimed by host" },
];

export function AdminListingImportForm({
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
      sourceLabel: String(formData.get("sourceLabel") ?? ""),
      publish: formData.get("publish") === "on",
      verified: formData.get("verified") === "on",
    };

    startTransition(async () => {
      setResult({});

      try {
        const response = await fetch("/api/admin/listings", {
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
          error: error instanceof Error ? error.message : "Import failed.",
        });
      }
    });
  }

  return (
    <form
      action={submit}
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-e1"
    >
      <div className="grid gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Title</span>
          <input name="title" required className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Short description</span>
          <textarea
            name="shortDescription"
            required
            rows={3}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Prize name</span>
            <input name="prizeName" required className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Prize value (USD)</span>
            <input
              name="prizeValue"
              type="number"
              min="0"
              step="1"
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Category</span>
            <select name="prizeCategory" required className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none">
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
            <select name="entryFrequency" required className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none">
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
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Official rules URL</span>
            <input
              name="officialRulesUrl"
              type="url"
              required
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
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
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Main image URL</span>
            <input name="mainImageUrl" type="url" className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Image alt text</span>
            <input name="imageAltText" className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Sponsor name</span>
            <input name="sponsorName" className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Source label</span>
            <select
              name="sourceLabel"
              defaultValue="found_by_sweepza"
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink">Tags</legend>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <label
                key={tag.code}
                className="inline-flex items-center gap-2 rounded-pill border border-line bg-paper px-3 py-1.5 text-xs text-ink/80"
              >
                <input type="checkbox" name="tagCodes" value={tag.code} />
                {tag.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-4 text-sm text-ink/75">
          <label className="inline-flex items-center gap-2">
            <input name="publish" type="checkbox" defaultChecked />
            Publish immediately
          </label>
          <label className="inline-flex items-center gap-2">
            <input name="verified" type="checkbox" />
            Mark listing verified
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Importing..." : "Create listing"}
        </button>
        {result.slug ? (
          <a
            href={result.url}
            className="text-sm font-semibold text-pine transition hover:underline"
          >
            Open `{result.slug}`
          </a>
        ) : null}
      </div>

      {result.error ? <p className="text-sm text-flame">{result.error}</p> : null}
    </form>
  );
}

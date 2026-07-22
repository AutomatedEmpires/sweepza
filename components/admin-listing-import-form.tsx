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
      longDescription: formData.get("longDescription")
        ? String(formData.get("longDescription"))
        : null,
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
      startDate: formData.get("startDate")
        ? String(formData.get("startDate"))
        : null,
      endDate: String(formData.get("endDate") ?? ""),
      entryFrequency: String(formData.get("entryFrequency") ?? ""),
      entryLimitNotes: formData.get("entryLimitNotes")
        ? String(formData.get("entryLimitNotes"))
        : null,
      eligibilityCountry: String(formData.get("eligibilityCountry") ?? ""),
      eligibilityStates: String(formData.get("eligibilityStates") ?? "")
        .split(",")
        .map((state) => state.trim().toUpperCase())
        .filter(Boolean),
      ageRequirement: Number(formData.get("ageRequirement")),
      noPurchaseNecessary: formData.get("noPurchaseNecessary") === "on",
      sponsorName: String(formData.get("sponsorName") ?? ""),
      sponsorUrl: formData.get("sponsorUrl")
        ? String(formData.get("sponsorUrl"))
        : null,
      winnerCount: formData.get("winnerCount")
        ? Number(formData.get("winnerCount"))
        : null,
      tagCodes: formData.getAll("tagCodes").map(String),
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

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Normalized summary</span>
          <textarea
            name="longDescription"
            rows={5}
            maxLength={2000}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
          />
          <span className="text-xs text-graphite">
            Sweepza summary only; the linked official rules remain authoritative.
          </span>
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
            <span className="font-medium text-ink">Start date</span>
            <input
              name="startDate"
              type="date"
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">End date</span>
            <input
              name="endDate"
              type="date"
              required
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
            />
          </label>

        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Eligibility country</span>
            <input
              name="eligibilityCountry"
              defaultValue="US"
              required
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Eligible region codes (U.S./Canada)</span>
            <input
              name="eligibilityStates"
              placeholder="CA, NY, DC, ON, QC"
              aria-describedby="admin-eligibility-states-help"
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
            />
            <span id="admin-eligibility-states-help" className="text-xs text-graphite">
              Comma-separated U.S. state/DC or Canadian province/territory
              codes. Leave blank when the rules cover the whole stated country.
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Minimum age</span>
            <input
              name="ageRequirement"
              type="number"
              min="13"
              max="120"
              defaultValue="18"
              required
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Winner count</span>
            <input
              name="winnerCount"
              type="number"
              min="1"
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Entry limit details</span>
            <input
              name="entryLimitNotes"
              placeholder="e.g. one entry per day"
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
            <input name="sponsorName" required className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Sponsor website</span>
            <input name="sponsorUrl" type="url" className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none" />
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
            <input name="noPurchaseNecessary" type="checkbox" required />
            Official rules confirm no purchase is necessary
          </label>
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

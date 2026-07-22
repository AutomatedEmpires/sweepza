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

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Promotion summary</span>
          <textarea
            name="longDescription"
            rows={5}
            maxLength={2000}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
          />
          <span className="text-xs text-graphite">
            Sweepza will label this as a normalized summary; official rules stay authoritative.
          </span>
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
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Eligible region codes (U.S./Canada)</span>
            <input
              name="eligibilityStates"
              placeholder="CA, NY, DC, ON, QC"
              aria-describedby="host-eligibility-states-help"
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
            />
            <span id="host-eligibility-states-help" className="text-xs text-graphite">
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
            <input
              name="mainImageUrl"
              type="url"
              required
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
              required
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Sponsor website</span>
            <input
              name="sponsorUrl"
              type="url"
              className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-graphite focus:border-ink focus:outline-none"
            />
          </label>
        </div>

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

        <label className="inline-flex items-start gap-2 rounded-xl border border-line bg-paper p-3 text-sm text-ink/80">
          <input name="noPurchaseNecessary" type="checkbox" required className="mt-0.5" />
          <span>
            I confirm the official rules state that no purchase is necessary
            and that the sponsor, dates, eligibility, and entry details above
            are accurate.
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
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

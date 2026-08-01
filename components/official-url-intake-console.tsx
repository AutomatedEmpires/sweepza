"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import type { OfficialUrlIntakeOperation } from "@/lib/official-url-intake-schema";
import { normalizeOfficialUrl } from "@/lib/official-url-normalization";

const MAX_BATCH_SIZE = 500;
const IDEMPOTENCY_KEY_PREFIX = "official-url:sha256:";

export { normalizeOfficialUrl };

export interface OfficialUrlIntakeEntry {
  idempotencyKey: string;
  officialUrl: string;
}

export interface OfficialUrlLineError {
  line?: number;
  message: string;
}

export type OfficialUrlPreparationResult =
  | {
      ok: true;
      entries: OfficialUrlIntakeEntry[];
    }
  | {
      ok: false;
      errors: OfficialUrlLineError[];
    };

export type OfficialUrlIntakeFeedback =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string; details?: string[] };

export function parseOfficialUrlLines(
  value: string,
):
  | { ok: true; normalizedUrls: string[] }
  | { ok: false; errors: OfficialUrlLineError[] } {
  const lines = value.split(/\r\n?|\n/);
  const nonEmptyLines = lines
    .map((line, index) => ({ line: index + 1, value: line.trim() }))
    .filter((entry) => entry.value.length > 0);
  const errors: OfficialUrlLineError[] = [];

  if (nonEmptyLines.length === 0) {
    return {
      ok: false,
      errors: [{ message: "Paste at least one official HTTPS URL." }],
    };
  }
  if (nonEmptyLines.length > MAX_BATCH_SIZE) {
    errors.push({
      message: `A batch may contain at most ${MAX_BATCH_SIZE} URLs; this batch contains ${nonEmptyLines.length}.`,
    });
  }

  const normalizedUrls: string[] = [];
  const firstLineByUrl = new Map<string, number>();

  for (const entry of nonEmptyLines) {
    try {
      const normalizedUrl = normalizeOfficialUrl(entry.value);
      const firstLine = firstLineByUrl.get(normalizedUrl);
      if (firstLine !== undefined) {
        errors.push({
          line: entry.line,
          message: `Duplicates line ${firstLine} after URL normalization.`,
        });
        continue;
      }

      firstLineByUrl.set(normalizedUrl, entry.line);
      normalizedUrls.push(normalizedUrl);
    } catch (error) {
      errors.push({
        line: entry.line,
        message: error instanceof Error ? error.message : "URL is invalid.",
      });
    }
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, normalizedUrls };
}

export async function deriveOfficialUrlIdempotencyKey(
  normalizedUrl: string,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "Secure URL hashing is unavailable in this browser. Nothing was queued.",
    );
  }

  const bytes = new TextEncoder().encode(normalizedUrl);
  const digest = await subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${IDEMPOTENCY_KEY_PREFIX}${hex}`;
}

export async function prepareOfficialUrlIntake(
  value: string,
): Promise<OfficialUrlPreparationResult> {
  const parsed = parseOfficialUrlLines(value);
  if (!parsed.ok) return parsed;

  const entries = await Promise.all(
    parsed.normalizedUrls.map(async (officialUrl) => ({
      officialUrl,
      idempotencyKey: await deriveOfficialUrlIdempotencyKey(officialUrl),
    })),
  );
  return { ok: true, entries };
}

export function formatOfficialUrlIntakeSuccess(
  accepted: number,
  replayed: number,
): string {
  const queued =
    accepted > 0
      ? `${accepted} official ${accepted === 1 ? "URL was" : "URLs were"} queued for private draft review.`
      : "";
  const unchanged =
    replayed > 0
      ? `${replayed} exact ${replayed === 1 ? "replay was" : "replays were"} already queued and left unchanged.`
      : "";
  const outcome =
    [queued, unchanged].filter(Boolean).join(" ") ||
    "No new official URLs were queued.";
  return `${outcome} Nothing was published.`;
}

export function formatOfficialUrlRevalidationSuccess(
  revalidated: number,
  pending: number,
): string {
  const queued =
    revalidated > 0
      ? `${revalidated} fresh validation ${revalidated === 1 ? "generation was" : "generations were"} queued.`
      : "";
  const unchanged =
    pending > 0
      ? `${pending} ${pending === 1 ? "request already has" : "requests already have"} unfinished validation work and ${pending === 1 ? "was" : "were"} left unchanged.`
      : "";
  const outcome =
    [queued, unchanged].filter(Boolean).join(" ") ||
    "No fresh validation work was queued.";
  return `${outcome} Existing results were preserved and nothing was published.`;
}

export function OfficialUrlIntakeFeedbackMessage({
  feedback,
}: {
  feedback: OfficialUrlIntakeFeedback;
}) {
  if (feedback.kind === "idle") return null;
  if (feedback.kind === "pending") {
    return (
      <p role="status" className="text-sm text-graphite">
        Validating URLs and deriving stable submission keys…
      </p>
    );
  }
  if (feedback.kind === "success") {
    return (
      <p role="status" className="text-sm text-pine">
        {feedback.message}
      </p>
    );
  }

  return (
    <div
      role="alert"
      className="rounded-xl border border-flame/30 bg-flame/10 px-3 py-2 text-sm text-flame"
    >
      <p className="font-semibold">{feedback.message}</p>
      {feedback.details?.length ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {feedback.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function OfficialUrlIntakeConsole() {
  const router = useRouter();
  const hintId = useId();
  const feedbackId = useId();
  const submittingRef = useRef(false);
  const [value, setValue] = useState("");
  const [operation, setOperation] =
    useState<OfficialUrlIntakeOperation>("enqueue");
  const [feedback, setFeedback] = useState<OfficialUrlIntakeFeedback>({
    kind: "idle",
  });
  const pending = feedback.kind === "pending";
  const lineCount = value
    .split(/\r\n?|\n/)
    .filter((line) => line.trim().length > 0).length;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setFeedback({ kind: "pending" });

    try {
      const prepared = await prepareOfficialUrlIntake(value);
      if (!prepared.ok) {
        setFeedback({
          kind: "error",
          message: "Fix the URL batch before queueing it.",
          details: prepared.errors.map((error) =>
            error.line
              ? `Line ${error.line}: ${error.message}`
              : error.message,
          ),
        });
        return;
      }

      const response = await fetch("/api/admin/ingestion/official-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          entries: prepared.entries,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            accepted?: number;
            replayed?: number;
            revalidated?: number;
            pending?: number;
            error?: string;
          }
        | null;

      if (!response.ok) {
        setFeedback({
          kind: "error",
          message:
            body?.error ??
            `Official URLs could not be queued (request ${response.status}).`,
        });
        return;
      }

      const confirmedCount =
        operation === "revalidate"
          ? typeof body?.revalidated === "number"
            ? body.revalidated
            : null
          : typeof body?.accepted === "number"
            ? body.accepted
            : null;
      if (confirmedCount === null) {
        // The request succeeded but the server never confirmed how many
        // entries were queued. Claiming the full batch here would misreport
        // work the server did not acknowledge.
        setValue("");
        setFeedback({
          kind: "error",
          message:
            "The request succeeded but returned no counts. Check the intake status below before resubmitting.",
        });
        router.refresh();
        return;
      }
      const message =
        operation === "revalidate"
          ? formatOfficialUrlRevalidationSuccess(
              confirmedCount,
              typeof body?.pending === "number" ? body.pending : 0,
            )
          : formatOfficialUrlIntakeSuccess(
              confirmedCount,
              typeof body?.replayed === "number" ? body.replayed : 0,
            );
      setValue("");
      setFeedback({
        kind: "success",
        message,
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Official URLs could not be queued. Nothing was published.",
      });
    } finally {
      submittingRef.current = false;
      setFeedback((current) =>
        current.kind === "pending"
          ? {
              kind: "error",
              message:
                "Official URLs could not be queued. Nothing was published.",
            }
          : current,
      );
    }
  }

  return (
    <section className="mt-6 rounded-card border border-gold/35 bg-surface p-5 shadow-e1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ember">
            Operator intake
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-ink">
            Bulk official URLs
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-graphite">
            Paste official sponsor or administrator pages to create durable
            ingestion work. Every accepted URL remains a private draft until it
            passes source policy, normalization, duplicate checks, and human
            publication review.
          </p>
        </div>
        <span className="rounded-pill border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-ink">
          Private draft / review only
        </span>
      </div>

      <p className="mt-4 rounded-xl border border-line bg-paper px-3 py-2 text-xs leading-relaxed text-graphite">
        This intake does not publish a promotion and does not authorize Sweepza
        to fetch a destination. Destination approval and ingestion gates remain
        separate.
      </p>

      <form
        onSubmit={submit}
        aria-busy={pending}
        className="mt-4 grid gap-3"
      >
        <label htmlFor="official-url-intake" className="text-sm font-medium text-ink">
          Official HTTPS URLs
        </label>
        <textarea
          id="official-url-intake"
          name="officialUrls"
          rows={9}
          value={value}
          disabled={pending}
          onChange={(event) => {
            setValue(event.target.value);
            if (
              feedback.kind !== "idle" &&
              feedback.kind !== "pending"
            ) {
              setFeedback({ kind: "idle" });
            }
          }}
          aria-describedby={`${hintId} ${feedbackId}`}
          aria-invalid={feedback.kind === "error" || undefined}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={"https://sponsor.com/promotion/rules\nhttps://brand.com/giveaway"}
          className="min-h-48 resize-y rounded-xl border border-line bg-paper px-3 py-2.5 font-mono text-sm text-ink focus:border-ember focus:outline-none disabled:cursor-wait disabled:opacity-70"
        />
        <div
          id={hintId}
          className="flex flex-wrap items-center justify-between gap-2 text-xs text-graphite"
        >
          <span>One HTTPS URL per line. Blank lines are ignored.</span>
          <span className={lineCount > MAX_BATCH_SIZE ? "font-semibold text-flame" : ""}>
            {lineCount} / {MAX_BATCH_SIZE} URLs
          </span>
        </div>

        <fieldset
          disabled={pending}
          className="grid gap-2 rounded-xl border border-line bg-paper p-3 sm:grid-cols-2"
        >
          <legend className="px-1 text-sm font-medium text-ink">
            Intake action
          </legend>
          <label className="flex cursor-pointer gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink has-[:checked]:border-ember has-[:checked]:bg-ember/10">
            <input
              type="radio"
              name="officialUrlIntakeOperation"
              value="enqueue"
              checked={operation === "enqueue"}
              onChange={() => {
                setOperation("enqueue");
                setFeedback({ kind: "idle" });
              }}
              className="mt-0.5 accent-ember"
            />
            <span>
              <span className="block font-semibold">New intake</span>
              <span className="block text-xs leading-relaxed text-graphite">
                Queue generation one; an exact replay stays unchanged.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink has-[:checked]:border-ember has-[:checked]:bg-ember/10">
            <input
              type="radio"
              name="officialUrlIntakeOperation"
              value="revalidate"
              checked={operation === "revalidate"}
              onChange={() => {
                setOperation("revalidate");
                setFeedback({ kind: "idle" });
              }}
              className="mt-0.5 accent-ember"
            />
            <span>
              <span className="block font-semibold">
                Revalidate completed
              </span>
              <span className="block text-xs leading-relaxed text-graphite">
                Queue a fresh generation without reopening prior work.
              </span>
            </span>
          </label>
        </fieldset>

        <div id={feedbackId}>
          <OfficialUrlIntakeFeedbackMessage feedback={feedback} />
        </div>

        <div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending
              ? operation === "revalidate"
                ? "Queueing fresh validation…"
                : "Queueing private drafts…"
              : operation === "revalidate"
                ? "Queue fresh validation"
                : "Queue private drafts"}
          </button>
        </div>
      </form>
    </section>
  );
}

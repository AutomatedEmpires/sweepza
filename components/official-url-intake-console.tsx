"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { isRegistrablePublicHostname } from "@/lib/public-hostname";

const MAX_BATCH_SIZE = 500;
const MAX_URL_LENGTH = 2048;
const IDEMPOTENCY_KEY_PREFIX = "official-url:sha256:";

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

function invalidUrl(message: string): never {
  throw new Error(message);
}

export function normalizeOfficialUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) invalidUrl("URL is empty.");
  if (trimmed.length > MAX_URL_LENGTH) {
    invalidUrl(`URL exceeds ${MAX_URL_LENGTH} characters.`);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    invalidUrl("Enter a valid absolute HTTPS URL.");
  }

  if (url.protocol !== "https:") {
    invalidUrl("URL must use HTTPS.");
  }
  if (url.username || url.password) {
    invalidUrl("URL must not contain credentials.");
  }
  if (url.port) {
    invalidUrl("URL must use the default HTTPS port.");
  }
  if (!isRegistrablePublicHostname(url.hostname)) {
    invalidUrl("URL must use a registrable public hostname.");
  }

  url.hash = "";
  return url.toString();
}

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
        body: JSON.stringify({ entries: prepared.entries }),
      });
      const body = (await response.json().catch(() => null)) as
        | { accepted?: number; replayed?: number; error?: string }
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

      const accepted =
        typeof body?.accepted === "number"
          ? body.accepted
          : prepared.entries.length;
      const replayed =
        typeof body?.replayed === "number" ? body.replayed : 0;
      setValue("");
      setFeedback({
        kind: "success",
        message: formatOfficialUrlIntakeSuccess(accepted, replayed),
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

        <div id={feedbackId}>
          <OfficialUrlIntakeFeedbackMessage feedback={feedback} />
        </div>

        <div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Queueing private drafts…" : "Queue private drafts"}
          </button>
        </div>
      </form>
    </section>
  );
}

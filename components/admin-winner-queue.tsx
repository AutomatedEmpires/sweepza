"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { WinnerModerationItem } from "@/lib/db/winner-moderation";
import type { WinnerModerationAction } from "@/lib/winner-moderation-schema";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

const STATUS_BADGE: Record<string, string> = {
  submitted: "bg-ink/5 text-ink/60",
  pending_review: "bg-ink/5 text-ink/60",
  published: "bg-moss/10 text-moss",
  hidden: "bg-ember/10 text-ember",
  rejected: "bg-ember/10 text-ember",
};

export function AdminWinnerQueue({ posts }: { posts: WinnerModerationItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    Record<string, { error?: string; message?: string }>
  >({});

  function runAction(winnerPostId: string, action: WinnerModerationAction) {
    setActiveId(winnerPostId);
    startTransition(async () => {
      setFeedback((prev) => ({ ...prev, [winnerPostId]: {} }));
      try {
        const payload = { winnerPostId, action };
        const response = await fetch("/api/admin/winners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = (await response.json().catch(() => null)) as
          | { error?: string; winnerPost?: { review_status?: string } }
          | null;
        if (!response.ok) {
          setFeedback((prev) => ({
            ...prev,
            [winnerPostId]: {
              error: body?.error ?? `Request failed (${response.status})`,
            },
          }));
          return;
        }
        setFeedback((prev) => ({
          ...prev,
          [winnerPostId]: {
            message: `Winner post is now ${body?.winnerPost?.review_status ?? action}.`,
          },
        }));
        router.refresh();
      } catch (error) {
        setFeedback((prev) => ({
          ...prev,
          [winnerPostId]: {
            error:
              error instanceof Error ? error.message : "Moderation action failed.",
          },
        }));
      } finally {
        setActiveId(null);
      }
    });
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-card border border-sand bg-white/70 p-4">
        <p className="text-sm leading-relaxed text-ink/60">
          No winner submissions need moderation right now.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {posts.map((post) => {
        const isBusy = pending && activeId === post.id;
        const state = feedback[post.id] ?? {};
        const badgeClass =
          STATUS_BADGE[post.review_status] ?? "bg-ink/5 text-ink/60";
        const isPublished = post.review_status === "published";

        return (
          <div
            key={post.id}
            className="rounded-card border border-sand bg-white/70 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {post.winner_display_name ?? "Unknown member"}
                </p>
                <p className="mt-1 text-xs text-ink/55">
                  Submitted {formatDateTime(post.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] font-semibold uppercase tracking-wide">
                <span className={`rounded-full px-2 py-1 ${badgeClass}`}>
                  {post.review_status}
                </span>
                {post.verified_win ? (
                  <span className="rounded-full bg-moss/10 px-2 py-1 text-moss">
                    verified
                  </span>
                ) : null}
              </div>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-ink/75">
              {post.caption ?? "No caption provided."}
            </p>

            <dl className="mt-3 grid gap-1 text-xs text-ink/60">
              <div className="flex items-center justify-between gap-3">
                <dt>Listing</dt>
                <dd className="max-w-[60%] truncate font-medium text-ink/80">
                  {post.listing_slug ? (
                    <Link
                      href={`/sweeps/${post.listing_slug}`}
                      className="text-moss underline-offset-2 hover:underline"
                    >
                      {post.listing_title ?? post.listing_slug}
                    </Link>
                  ) : (
                    "No linked listing"
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Photo</dt>
                <dd className="max-w-[60%] truncate font-medium text-ink/80">
                  {post.photo_url ? (
                    <a
                      href={post.photo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-moss underline-offset-2 hover:underline"
                    >
                      View photo
                    </a>
                  ) : (
                    "No photo"
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!isPublished ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => runAction(post.id, "approve")}
                  className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-cream transition hover:bg-moss/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Approve &amp; publish
                </button>
              ) : null}
              {isPublished ? (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => runAction(post.id, "hide")}
                  className="rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink/75 transition hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Hide post
                </button>
              ) : null}
              <button
                type="button"
                disabled={isBusy}
                onClick={() => runAction(post.id, "reject")}
                className="rounded-full border border-ember/40 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reject &amp; keep private
              </button>
            </div>

            {state.error ? (
              <p className="mt-3 rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember">
                {state.error}
              </p>
            ) : null}
            {state.message ? (
              <p className="mt-3 rounded-xl border border-moss/30 bg-moss/10 px-3 py-2 text-sm text-moss">
                {state.message}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

import "server-only";
import { createHash } from "node:crypto";

import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Lightweight best-effort in-memory sliding-window rate limiter.
 *
 * IMPORTANT: this state lives in the memory of a single serverless
 * function instance. It is NOT shared across instances/regions, and it
 * resets whenever an instance is recycled. That means a determined
 * attacker distributed across many cold-started instances can exceed
 * the nominal limit. This is a best-effort speed bump, not a hard
 * security boundary — it still meaningfully blunts casual abuse and
 * scripted spam from a single client. The production-grade upgrade is
 * a distributed limiter backed by shared storage (e.g. Upstash Redis /
 * @upstash/ratelimit) so limits are enforced consistently across all
 * instances.
 */

export interface RateLimitOptions {
  /** Stable endpoint or action namespace for an independent request bucket. */
  namespace: string;
  /** Maximum number of requests allowed within the window. */
  limit: number;
  /** Sliding window size, in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

// namespace + client key -> timestamps (ms) within the current window.
const hits = new Map<string, number[]>();

// Periodically purge stale entries so the map doesn't grow unbounded
// over the lifetime of a long-lived serverless instance.
const MAX_TRACKED_KEYS = 5000;

export function rateLimit(
  key: string,
  opts: RateLimitOptions,
): RateLimitResult {
  const { namespace, limit, windowMs } = opts;
  const now = Date.now();
  const windowStart = now - windowMs;
  const bucketKey = `${namespace}\u0000${key}`;

  const existing = hits.get(bucketKey) ?? [];
  const recent = existing.filter((ts) => ts > windowStart);

  if (recent.length >= limit) {
    const oldest = recent[0];
    const retryAfterMs = Math.max(0, oldest + windowMs - now);
    hits.set(bucketKey, recent);
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  recent.push(now);
  hits.set(bucketKey, recent);

  // Best-effort cleanup to bound memory usage in a long-lived instance.
  if (hits.size > MAX_TRACKED_KEYS) {
    for (const [trackedKey, timestamps] of hits) {
      const stillRecent = timestamps.filter((ts) => ts > windowStart);
      if (stillRecent.length === 0) {
        hits.delete(trackedKey);
      } else {
        hits.set(trackedKey, stillRecent);
      }
    }
  }

  return { ok: true, retryAfterSec: 0 };
}

export async function rateLimitShared(
  key: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const bucketKey = createHash("sha256")
    .update(`${opts.namespace}\0${key}`)
    .digest("hex");
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_bucket_key: `${opts.namespace}:${bucketKey}`,
    p_limit: opts.limit,
    p_window_seconds: Math.max(1, Math.ceil(opts.windowMs / 1000)),
  });
  if (error) {
    throw new Error(`Shared rate limiter unavailable: ${error.message}`);
  }
  const result = data as { ok?: boolean; retry_after_sec?: number } | null;
  if (typeof result?.ok !== "boolean") {
    throw new Error("Shared rate limiter returned an invalid result.");
  }
  return {
    ok: result.ok,
    retryAfterSec: Math.max(0, result.retry_after_sec ?? 0),
  };
}

/**
 * Derives a best-effort client key from the request for use with
 * rateLimit().
 *
 * Header trust matters here: the LEFTMOST `x-forwarded-for` hop is
 * client-supplied and can be rotated per request to evade the limiter, so we
 * never key on it. We prefer `x-real-ip`, which the hosting platform's edge
 * (Vercel) sets to the actual connecting client IP and the client cannot
 * spoof. Only if that is absent do we fall back to the RIGHTMOST `x-forwarded-
 * for` hop — the one appended by the nearest trusted proxy — rather than the
 * leftmost. When no forwarding header is present (e.g. local dev) we degrade to
 * a single shared key rather than failing open.
 */
export function clientKey(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    const nearestTrusted = hops[hops.length - 1];
    if (nearestTrusted) return nearestTrusted;
  }

  return "unknown";
}

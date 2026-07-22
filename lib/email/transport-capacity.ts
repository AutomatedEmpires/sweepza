import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const denialReasonSchema = z.enum([
  "host_unavailable",
  "host_authority_changed",
  "invalid_authorization_scope",
  "notification_preference_changed",
  "recipient_unavailable",
  "unsupported_notification_type",
]);

const authorizationSchema = z.union([
  z.object({
    authorized: z.literal(false),
    reserved: z.literal(false),
    app_user_id: z.string().uuid().nullable().optional(),
    reason: denialReasonSchema,
  }),
  z.object({
    authorized: z.literal(true),
    reserved: z.literal(false),
    app_user_id: z.string().uuid(),
    next_attempt_at: z.string().datetime({ offset: true }),
  }),
  z.object({
    authorized: z.literal(true),
    reserved: z.literal(true),
    app_user_id: z.string().uuid(),
    recipient: z.string().trim().min(1),
  }),
]);

const MAX_CAPACITY_WAIT_MS = 5_000;
const MIN_CAPACITY_RETRY_MS = 25;

export type TransactionalEmailPreferenceKey =
  | "email_on_listing_approved"
  | "email_on_listing_held"
  | "email_on_listing_expiring_soon"
  | "winner_wall_verification";

export type TransactionalEmailAuthorization =
  | {
      authorized: true;
      appUserId: string;
      recipient: string;
    }
  | {
      authorized: false;
      appUserId: string | null;
      reason: z.infer<typeof denialReasonSchema>;
    };

export class EmailTransportCapacityError extends Error {
  constructor() {
    super("Email transport capacity could not be reserved safely.");
    this.name = "EmailTransportCapacityError";
  }
}

/**
 * Re-authorize the exact recipient and preference snapshot in the same
 * transaction that reserves one rolling provider request. A full window is
 * retried within a bounded request budget; database errors and malformed state
 * fail closed before transport.
 */
export async function authorizeTransactionalEmailTransport(
  supabase: Pick<SupabaseClient, "rpc">,
  args: {
    appUserId: string | null;
    hostId: string | null;
    preferenceKey: TransactionalEmailPreferenceKey;
  },
): Promise<TransactionalEmailAuthorization> {
  const deadline = Date.now() + MAX_CAPACITY_WAIT_MS;

  while (true) {
    const { data, error } = await supabase.rpc(
      "authorize_transactional_email_transport",
      {
        p_app_user_id: args.appUserId,
        p_host_id: args.hostId,
        p_preference_key: args.preferenceKey,
      },
    );
    if (error) throw new EmailTransportCapacityError();

    const parsed = authorizationSchema.safeParse(data);
    if (!parsed.success) throw new EmailTransportCapacityError();
    if (!parsed.data.authorized) {
      return {
        authorized: false,
        appUserId: parsed.data.app_user_id ?? null,
        reason: parsed.data.reason,
      };
    }
    if (parsed.data.reserved) {
      return {
        authorized: true,
        appUserId: parsed.data.app_user_id,
        recipient: parsed.data.recipient,
      };
    }

    const waitMs = Math.max(
      MIN_CAPACITY_RETRY_MS,
      Date.parse(parsed.data.next_attempt_at) - Date.now(),
    );
    if (!Number.isFinite(waitMs) || Date.now() + waitMs > deadline) {
      throw new EmailTransportCapacityError();
    }

    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

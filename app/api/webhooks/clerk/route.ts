import { type NextRequest, NextResponse } from "next/server";
import { verifyWebhook, type WebhookEvent } from "@clerk/nextjs/webhooks";
import {
  deleteAppUserByClerkId,
  syncAppUserFromClerkPayload,
} from "@/lib/auth";
import { env } from "@/lib/env";

type ClerkWebhookUserPayload = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: Array<{
    id?: string | null;
    email_address?: string | null;
  }>;
};

function getWebhookSecret(): string | null {
  return env.CLERK_WEBHOOK_SECRET ?? null;
}

export async function POST(request: NextRequest) {
  const secret = getWebhookSecret();

  if (!secret) {
    return NextResponse.json(
      { error: "Clerk webhook secret is not configured." },
      { status: 503 },
    );
  }

  let event: WebhookEvent;
  try {
    event = await verifyWebhook(request, { signingSecret: secret });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Webhook verification failed.",
        message: error instanceof Error ? error.message : "unknown error",
      },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "user.created":
      case "user.updated": {
        const payload = event.data as unknown as ClerkWebhookUserPayload;
        const appUser = await syncAppUserFromClerkPayload({
          id: payload.id,
          firstName: payload.first_name,
          lastName: payload.last_name,
          username: payload.username,
          primaryEmailAddressId: payload.primary_email_address_id,
          emailAddresses: payload.email_addresses,
        });

        return NextResponse.json({
          ok: true,
          action: "upserted",
          appUserId: appUser.id,
          clerkUserId: appUser.clerk_user_id,
          eventType: event.type,
        });
      }

      case "user.deleted": {
        const payload = event.data as { id?: string | null };
        if (payload.id) {
          await deleteAppUserByClerkId(payload.id);
        }

        return NextResponse.json({
          ok: true,
          action: "deleted",
          clerkUserId: payload.id ?? null,
          eventType: event.type,
        });
      }

      default:
        return NextResponse.json({
          ok: true,
          action: "ignored",
          eventType: event.type,
        });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "Webhook processing failed.",
        message: error instanceof Error ? error.message : "unknown error",
        eventType: event.type,
      },
      { status: 500 },
    );
  }
}

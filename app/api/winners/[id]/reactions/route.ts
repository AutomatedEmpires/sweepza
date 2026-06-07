import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ReactionType } from "@/lib/db/enums";

function getAccessToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const [type, token] = auth.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const accessToken = getAccessToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const body = (await req.json()) as { reactionType: ReactionType };

    const supabase = createServerSupabaseClient(accessToken);
    const { error } = await supabase.from("winner_reaction").insert({
      winner_post_id: id,
      reaction_type: body.reactionType,
    });

    if (error) {
      // Unique constraint means user already reacted; treat as success.
      if (error.code === "23505") {
        return NextResponse.json({ ok: true }, { status: 200 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

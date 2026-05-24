// POST /api/conversation/message — single endpoint that drives the bot.
// Reads the wf_thread cookie (creates one if absent), calls HandleUserMessage,
// returns the bot reply + the new state for the client to render.
//
// This handler is intentionally thin: parse → call use case → return JSON.
// Business logic lives in HandleUserMessage, not here.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { ConversationId } from "@/modules/conversation/domain/conversation";
import { handleUserMessage } from "@/shared/infrastructure/composition-root";

const BodySchema = z.object({
  text: z.string().min(1, "text is required").max(50_000, "text too long"),
});

const COOKIE_NAME = "wf_thread";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: Request): Promise<NextResponse> {
  const json = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_BODY", detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME)?.value;
  const threadId = existing ?? crypto.randomUUID();

  const out = await handleUserMessage.execute({
    conversationId: ConversationId(threadId),
    text: parsed.data.text,
  });

  const response = NextResponse.json({
    reply: out.reply,
    state: out.state,
    screeningId: out.screeningId,
  });

  if (!existing) {
    response.cookies.set(COOKIE_NAME, threadId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
  }

  return response;
}

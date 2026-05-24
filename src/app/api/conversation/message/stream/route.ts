// POST /api/conversation/message/stream
//
// Same input as /api/conversation/message, but returns a Server-Sent Events
// stream so the chat UI can render the reply progressively (typewriter
// effect) instead of waiting for the whole HTTP response.
//
// What this DOES NOT do: stream the LLM's tokens themselves. The screening
// flow uses Anthropic tool_use, which produces structured JSON — streaming
// the JSON deltas to the UI would just show noise. The architectural seam
// (a streaming use-case path) is here; for the current tool_use flow the
// chunking happens after the LLM returns. If we later add a prose-mode
// response, this route would surface real token streaming with no client
// changes.

import { cookies } from "next/headers";
import { z } from "zod";
import { ConversationId } from "@/modules/conversation/domain/conversation";
import { handleUserMessage } from "@/shared/infrastructure/composition-root";

const BodySchema = z.object({
  text: z.string().min(1).max(50_000),
});

const COOKIE_NAME = "wf_thread";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const CHUNK_SIZE = 24; // ~one word, balances smoothness and bandwidth
const CHUNK_DELAY_MS = 18; // gentle typewriter, not slow enough to feel laggy

export async function POST(request: Request): Promise<Response> {
  const json = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME)?.value;
  const threadId = existing ?? crypto.randomUUID();

  const result = await handleUserMessage.execute({
    conversationId: ConversationId(threadId),
    text: parsed.data.text,
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      for (let i = 0; i < result.reply.length; i += CHUNK_SIZE) {
        const chunk = result.reply.slice(i, i + CHUNK_SIZE);
        sendEvent("chunk", { text: chunk });
        if (i + CHUNK_SIZE < result.reply.length) {
          await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
        }
      }

      sendEvent("done", {
        state: result.state,
        screeningId: result.screeningId,
      });
      controller.close();
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };

  if (!existing) {
    const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
    headers["Set-Cookie"] =
      `${COOKIE_NAME}=${threadId}; HttpOnly; SameSite=Lax;${secure} Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/`;
  }

  return new Response(body, { status: 200, headers });
}

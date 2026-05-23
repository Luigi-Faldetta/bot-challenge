// Anthropic implementation of IntentClassifier using Claude Haiku 4.5.
//
// Haiku is plenty for a 4-class classification with worked examples in the
// system prompt. ~$0.0001 per call, ~300ms p50 latency. Sonnet would be
// ~8x cost for marginal accuracy gain on a task this constrained.
//
// Prompt caching: cache_control on the system prompt (which contains the
// classification rules + examples and is identical across calls). After
// the first message in a process's lifetime, every subsequent classify()
// gets a cache hit, halving latency in practice.
//
// tool_use + Zod: same pattern as the screening provider — force structured
// output, validate at the boundary.

import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { z } from "zod";
import { ok, err, type Result } from "@/shared/domain/result";
import type {
  IntentClassifier,
  Intent,
  IntentClassifierError,
} from "@/modules/conversation/domain/ports/intent-classifier";

const TOOL_NAME = "classify_intent";

const SYSTEM_PROMPT = `You classify user messages in a recruiting chat bot into one of four intents. Reply with the classify_intent tool only; never reply with prose.

Intents:
- "screen": the user wants to evaluate a candidate against a job description.
- "newjob": the user wants to draft, build, or create a new job description.
- "cancel": the user wants to abandon the current flow, go back, or stop.
- "none": the user is providing content (a JD, a CV, a candidate description), chatting, or asking an unrelated question.

Examples:
- "screen a candidate" → screen
- "I'd like to evaluate this CV against the role" → screen
- "Can you screen Tomás for the backend opening?" → screen
- "create a job" → newjob
- "Help me draft a senior engineer role" → newjob
- "I want to write a new posting" → newjob
- "cancel" → cancel
- "nevermind, go back" → cancel
- "stop" → cancel
- "hello" → none
- "Senior Backend Engineer at Acme. 4+ years TypeScript, NestJS, Postgres." → none
- "Elena Kowalski, 6 years experience..." → none

When in doubt, prefer "none". False positives that restart the flow are worse than missing an intent.`;

const ToolInputSchema = z.object({
  intent: z.enum(["screen", "newjob", "cancel", "none"]),
});

export type AnthropicIntentClassifierOptions = {
  apiKey: string | undefined;
  model?: string;
  maxTokens?: number;
};

export class AnthropicIntentClassifier implements IntentClassifier {
  private readonly client: Anthropic | null;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicIntentClassifierOptions) {
    this.client = opts.apiKey ? new Anthropic({ apiKey: opts.apiKey }) : null;
    this.model = opts.model ?? "claude-haiku-4-5-20251001";
    this.maxTokens = opts.maxTokens ?? 64;
  }

  async classify(
    text: string,
  ): Promise<Result<Intent, IntentClassifierError>> {
    if (!this.client) {
      return err({ kind: "AUTH_FAILED" });
    }

    let response;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: text }],
        tools: [
          {
            name: TOOL_NAME,
            description: "Classify the user's intent.",
            input_schema: {
              type: "object",
              properties: {
                intent: {
                  type: "string",
                  enum: ["screen", "newjob", "cancel", "none"],
                  description: "The classified intent.",
                },
              },
              required: ["intent"],
            },
          },
        ],
        tool_choice: { type: "tool", name: TOOL_NAME },
      });
    } catch (e) {
      return err(mapError(e));
    }

    const toolBlock = response.content.find(
      (b): b is Extract<typeof b, { type: "tool_use" }> => b.type === "tool_use",
    );
    if (!toolBlock) {
      return err({
        kind: "MALFORMED_RESPONSE",
        detail: "No tool_use block in classifier response.",
      });
    }

    const parsed = ToolInputSchema.safeParse(toolBlock.input);
    if (!parsed.success) {
      return err({
        kind: "MALFORMED_RESPONSE",
        detail: parsed.error.message,
      });
    }

    return ok(parsed.data.intent);
  }
}

function mapError(e: unknown): IntentClassifierError {
  if (e instanceof APIError) {
    if (e.status === 429) return { kind: "RATE_LIMITED" };
    if (e.status === 401 || e.status === 403) return { kind: "AUTH_FAILED" };
    if (e.status && e.status >= 500) return { kind: "UNAVAILABLE" };
    return { kind: "UNKNOWN", detail: `Anthropic ${e.status}: ${e.message}` };
  }
  if (e instanceof Error) return { kind: "UNKNOWN", detail: e.message };
  return { kind: "UNKNOWN", detail: String(e) };
}

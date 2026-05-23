// Anthropic implementation of the ScreeningProvider port.
//
// Why tool_use instead of plain text + JSON.parse:
//   Claude's `tool_use` mode forces a function-call-shaped response that
//   conforms to a JSON schema declared up front. We further validate with Zod
//   at the boundary so a malformed response is a typed error, not a runtime
//   exception deep in the use case.
//
// Why two cache_control breakpoints (system + JD):
//   On re-screening the same role against a different candidate, the system
//   prompt + JD prefix can be served from Anthropic's prompt cache, cutting
//   input cost roughly in half. The CV (per-call content) stays uncached.
//   See https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching.

import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { z } from "zod";
import { ok, err, type Result } from "@/shared/domain/result";
import { MatchScore } from "@/modules/screening/domain/match-score";
import type {
  ScreeningProvider,
  ScreeningProviderError,
} from "@/modules/screening/domain/ports/screening-provider";
import type { ScreeningAnalysis } from "@/modules/screening/domain/screening-result";

const TOOL_NAME = "submit_screening_report";

const SYSTEM_PROMPT = `You are an expert technical recruiter screening a candidate's CV against a job description. Be specific, honest, and concise. Do not invent strengths or gaps that aren't supported by the JD/CV text. Score the candidate 0–100, where 0 = clear mismatch, 50 = marginal fit, 75+ = strong fit. Always submit your full report via the ${TOOL_NAME} tool — do not reply with prose.`;

const ToolInputSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string().min(1),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  recommendation: z.string().min(1),
});

export type AnthropicScreeningProviderOptions = {
  apiKey: string | undefined;
  model?: string;
  maxTokens?: number;
};

export class AnthropicScreeningProvider implements ScreeningProvider {
  private readonly client: Anthropic | null;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicScreeningProviderOptions) {
    this.client = opts.apiKey ? new Anthropic({ apiKey: opts.apiKey }) : null;
    this.model = opts.model ?? "claude-sonnet-4-6";
    this.maxTokens = opts.maxTokens ?? 2048;
  }

  async run(args: {
    jobDescription: string;
    candidateCv: string;
  }): Promise<Result<ScreeningAnalysis, ScreeningProviderError>> {
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
          {
            type: "text",
            text: `Job description:\n${args.jobDescription}`,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: `Candidate CV:\n${args.candidateCv}`,
          },
        ],
        tools: [
          {
            name: TOOL_NAME,
            description:
              "Submit the structured screening report. Always use this tool — never reply with prose.",
            input_schema: {
              type: "object",
              properties: {
                score: {
                  type: "integer",
                  minimum: 0,
                  maximum: 100,
                  description: "Overall match 0..100.",
                },
                summary: {
                  type: "string",
                  description:
                    "One- or two-sentence verdict — what's the headline match story?",
                },
                strengths: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Concrete strengths grounded in the CV (each tied to a JD requirement).",
                },
                gaps: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Concrete gaps — JD requirements the CV does not satisfy.",
                },
                recommendation: {
                  type: "string",
                  description:
                    "Single-sentence action recommendation (e.g. 'Recommend phone screen.', 'Reject — wrong role.', 'Recommend take-home then onsite.').",
                },
              },
              required: ["score", "summary", "strengths", "gaps", "recommendation"],
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
        detail: "No tool_use block in Anthropic response.",
      });
    }

    const parsed = ToolInputSchema.safeParse(toolBlock.input);
    if (!parsed.success) {
      return err({
        kind: "MALFORMED_RESPONSE",
        detail: `Tool input failed schema validation: ${parsed.error.message}`,
      });
    }

    const score = MatchScore.create(parsed.data.score);
    if (!score.ok) {
      return err({ kind: "MALFORMED_RESPONSE", detail: score.error });
    }

    return ok({
      score: score.value,
      summary: parsed.data.summary,
      strengths: parsed.data.strengths,
      gaps: parsed.data.gaps,
      recommendation: parsed.data.recommendation,
    });
  }
}

function mapError(e: unknown): ScreeningProviderError {
  if (e instanceof APIError) {
    if (e.status === 429) return { kind: "RATE_LIMITED" };
    if (e.status === 401 || e.status === 403) return { kind: "AUTH_FAILED" };
    // Connection failures (APIConnectionError, APIConnectionTimeoutError)
    // extend APIError with no status code. Bucket them with 5xx as
    // UNAVAILABLE — semantically the upstream LLM is unreachable, which
    // is what we want the user to see.
    if (e.status === undefined || e.status >= 500) {
      return { kind: "UNAVAILABLE" };
    }
    return { kind: "UNKNOWN", detail: `Anthropic ${e.status}: ${e.message}` };
  }
  if (e instanceof Error) return { kind: "UNKNOWN", detail: e.message };
  return { kind: "UNKNOWN", detail: String(e) };
}

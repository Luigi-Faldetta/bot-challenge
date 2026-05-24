# ADR 0007 — `tool_use` + Zod for structured LLM output

- **Status**: Accepted
- **Date**: 2026-05-21

## Context

The screening LLM needs to return a structured report: a numeric score (0–100), a summary string, lists of strengths and gaps, and a recommendation. The domain expects this exact shape (`ScreeningAnalysis`). The LLM, left to itself, replies in prose.

Anthropic offers two ways to get structured output:

- **Plain text + parse**: ask for JSON in the system prompt, parse the response with `JSON.parse` or a regex.
- **`tool_use` mode**: declare a tool with a JSON Schema; the model is forced to "call" it with input that conforms.

Validation is a separate axis:

- Trust the LLM to honour the declared schema.
- Re-validate on our side at the adapter boundary.

## Decision

Combine three layers:

1. **`tool_use` with `tool_choice: { type: 'tool', name: TOOL_NAME }`** — forces Claude to emit a `tool_use` block whose `input` conforms to a declared JSON Schema. No prose escape hatch.
2. **Zod validates the tool input at the adapter boundary.** A failure becomes a typed `{ kind: 'MALFORMED_RESPONSE' }` error; the use case maps it to a friendly user reply.
3. **`MatchScore.create(...)` enforces domain invariants on the score.** Triple-layered defence in depth.

```ts
// anthropic-screening-provider.ts:149-160
const parsed = ToolInputSchema.safeParse(toolBlock.input);
if (!parsed.success) {
  return err({ kind: 'MALFORMED_RESPONSE', detail: parsed.error.message });
}
const score = MatchScore.create(parsed.data.score);
if (!score.ok) {
  return err({ kind: 'MALFORMED_RESPONSE', detail: score.error });
}
```

## Consequences

**Wins**:

- A hallucinated score of 150 is caught **three times**: JSON Schema (`maximum: 100`), Zod (`z.number().int().min(0).max(100)`), and `MatchScore.create`. Defence in depth.
- The use case sees `Result<ScreeningAnalysis, ScreeningProviderError>` — never a raw SDK response. Easy to test (mock the port), easy to reason about.
- Adding a new field to the screening report means changing the schema in three places. The cost is real but proportional; the duplication keeps the boundaries explicit.

**Costs**:

- Schema declared three times: JSON Schema (sent to Claude), Zod (validate response), TypeScript type (downstream code). Anthropic's SDK doesn't infer one from the others.
- Forced tool calls have slightly higher latency than plain text replies — but not measurably so at our payload size.

## Alternatives considered

- **Plain text + `JSON.parse`**: cheaper to set up, much weaker at runtime. The LLM might wrap the JSON in markdown fences (` ```json ... ``` `), or add preamble text, or hallucinate a missing field. Every recovery path adds parsing complexity for a feature we don't need.
- **`tool_use` without Zod validation**: trust the JSON Schema declaration. Rejected because the SDK boundary is untrusted; older models occasionally violate declared schemas, and recovery via typed `MALFORMED_RESPONSE` is much cleaner than a try/catch around a deep `analysis.score.value` access.
- **Use Anthropic's beta `messages.parse()` endpoint** (auto-parses tool input into a typed shape using a provided Zod schema). Rejected because: (a) it ties us tightly to the SDK's specific Zod integration, (b) the manual `safeParse` is two lines and easy to read.

The pattern is reused 1:1 in the intent classifier (`anthropic-intent-classifier.ts`) — same `tool_use`, same Zod validation, smaller scope (one enum field). Once written, it's the project's house style for any LLM call.

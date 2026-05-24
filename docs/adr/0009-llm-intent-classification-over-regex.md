# ADR 0009 — LLM intent classification, not regex

- **Status**: Accepted
- **Date**: 2026-05-22

## Context

The brief requires the bot to recognise commands like `/screen` and `/cancel`, AND to handle natural-language equivalents ("I want to evaluate a candidate", "nevermind, go back"). Approaches:

- **Regex / keyword match**: pattern-match against a known vocabulary ("screen", "cancel", "candidate", etc.).
- **LLM intent classifier**: ship the user text to a small model and ask it to bucket the intent.

## Decision

Two-tier intent resolution:

1. **Slash commands match a regex** (`/^\/(screen|newjob|cancel)\s*$/i`). Sync, free, deterministic — covers the literal-command path.
2. **Everything else goes to an LLM classifier.** A Claude Haiku 4.5 call with `tool_use` and a 4-class output (`screen` | `newjob` | `cancel` | `none`), behind an `IntentClassifier` port.

The classifier's result is then mapped to an FSM event with **state-aware demotion**:

- `cancel` always emits `COMMAND("cancel")`.
- `screen` / `newjob` emit a `COMMAND` only from `IDLE`; from any other state they're demoted to `USER_MESSAGE`.
- `none` is always `USER_MESSAGE`.

Classifier failures (network blip, 429, missing API key) fall back to `intent = "none"` → `USER_MESSAGE`. The bot never crashes on Anthropic outage.

## Consequences

**Wins**:

- Real natural-language understanding. "I'd like to evaluate this CV against the role" → `SCREENING`, no special phrasing required.
- The state-aware demotion stops false positives: if the user is mid-`SCREENING` and pastes a CV that mentions "screening", the classifier returns `"screen"` but the mapper demotes it to `USER_MESSAGE` so the JD isn't discarded.
- The classifier is behind a port; tests replace it with a static map. No LLM calls in unit tests.
- Cost is negligible: Claude Haiku 4.5 at ~$0.0001/call, ~300ms p50 latency. Prompt caching on the system prompt halves latency after the first call.

**Costs**:

- Adds an LLM dependency to the happy path. If Anthropic is fully down, slash commands still work but natural-language triggers degrade to `USER_MESSAGE` (which is also the right thing to do).
- Two LLMs in the stack now (Sonnet for screening, Haiku for intent). The mental model is "cost-tier-appropriate models", which is easier to defend than to set up.

## Alternatives considered

- **Regex / keyword match** — rejected because:
  - "Screen this candidate" matches; "I'd like to evaluate this candidate" doesn't. Brittle. Each new phrasing is a new regex; we'd ship a 50-line regex eventually and still miss cases.
  - Negation flips intent: "Don't screen this" should not trigger `SCREENING`. Regex handles this poorly; the LLM handles it natively.
- **Use Sonnet for intent classification too** — rejected because:
  - 8× cost for marginal accuracy on a 4-class task with worked examples in the system prompt. Haiku is correct for the cost tier.
- **Tool-less prompt that asks for a JSON intent label** — rejected for the same reason as [ADR 0007](0007-tool-use-with-zod-for-structured-output.md) (no prose escape hatch). `tool_use` with `tool_choice` forces structured output; Zod validates it; the port returns a typed `Result<Intent, IntentClassifierError>`.

The pattern is the project's house style: every LLM call is a typed `Result<T, E>` behind a port, with cost-tier-appropriate model selection.

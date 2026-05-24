# ADR 0003 — Anthropic SDK directly, not LangChain

- **Status**: Accepted
- **Date**: 2026-05-21

## Context

Two LLM calls in the bot: the screening provider (Claude Sonnet, JD ↔ CV analysis) and the intent classifier (Claude Haiku, 4-class classification). Both call Anthropic. Options for how to call:

- **`@anthropic-ai/sdk` directly** — official SDK, 1:1 with the API.
- **LangChain** — provider-agnostic abstraction, agent runtime, tool/output parsers, memory, etc.

## Decision

Use `@anthropic-ai/sdk` directly. Wrap it in a `ScreeningProvider` / `IntentClassifier` port; the use case sees only the port.

## Consequences

**Wins**:

- All Anthropic features available immediately: prompt caching (`cache_control: ephemeral`), `tool_use` with `tool_choice`, etc. LangChain wraps these, but every wrapper is one release-cycle behind.
- The adapter is ~188 lines (screening) + ~146 lines (intent classifier). The whole LLM integration is auditable in one sitting.
- Errors map cleanly via `instanceof APIError` (rate limits, auth failures, connection errors). The use case sees a typed `Result<T, ScreeningProviderError>` union with five kinds.
- No abstraction tax: if Anthropic ships a new feature, we can use it without waiting for LangChain to expose it.

**Costs**:

- If we ever want to swap providers (OpenAI, Bedrock, Cohere), we re-implement the adapter behind the existing port. LangChain would have hidden this swap behind one config change.
- We don't get LangChain's built-in retry/backoff. We could add it ourselves at the adapter; not needed yet.

## Alternatives considered

- **LangChain JS** — would give us a uniform interface across providers, output parsers, retry logic, and an agent runtime. Rejected because:
  - **The port + adapter already gives us provider-agnosticism.** The use case depends on `ScreeningProvider`, not on Anthropic. Adding LangChain on top of that is one more layer providing the same property.
  - **LangChain's tool/output abstractions are weaker than what we built.** We use `tool_use` + Zod for type-safe structured output (see [ADR 0007](0007-tool-use-with-zod-for-structured-output.md)); LangChain's `StructuredOutputParser` is regex-on-JSON in practice.
  - **Cost discipline.** Prompt caching with two cache breakpoints (system + JD) is a key cost lever. LangChain's `ChatAnthropic` does support `cache_control`, but the seams are awkward and the docs are sparse.
- **LangGraph** — see [ADR 0001](0001-plain-ts-fsm-over-langgraph.md). Not relevant here either; routing is FSM-driven, not LLM-driven.

The mental model: **LangChain is for projects that need to integrate many LLM providers and want one abstraction.** This bot has one provider and two well-bounded calls; the abstraction would cost more than it pays.

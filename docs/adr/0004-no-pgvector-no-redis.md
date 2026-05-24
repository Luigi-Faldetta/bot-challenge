# ADR 0004 — No pgvector, no Redis

- **Status**: Accepted
- **Date**: 2026-05-21

## Context

LLM applications often reach for:

- **pgvector** — Postgres extension for vector similarity search. Used in RAG pipelines, semantic dedupe, recommendation, etc.
- **Redis** — in-memory cache for hot data, rate-limit counters, session stores, idempotency keys, etc.

Both are excellent at the right scale. The question is whether this bot is at that scale.

## Decision

Neither pgvector nor Redis is installed. The bot uses plain Postgres tables and module-scoped state.

## Consequences

**Wins**:

- One process, one database, one Docker container. Local dev starts with `docker compose up -d`.
- The architecture stays inspectable. No "where does this cached value come from?" debugging.
- No additional ops surface (cache invalidation rules, vector index rebuilds, Redis persistence config).

**Costs**:

- Re-screening the same `(JD, CV)` pair re-hits Anthropic. Anthropic's prompt cache covers the input-cost side; the output tokens are paid again. At demo scale this is invisible.
- No semantic search over past screenings. If two recruiters ask "have we seen this candidate before?", they'd need to remember the conversation id; we can't fuzzy-match the CV text.

## Alternatives considered

### pgvector

Use case would be **semantic dedupe of CVs** or **finding similar past screenings**. Rejected because:

- The bot screens **one JD against one CV per conversation**. There's no corpus to search. A vector index over a set of size 1 is just an index over the row itself — no benefit over a primary-key lookup.
- A future "find similar past candidates" feature would need pgvector. That's a forward-looking choice; this take-home isn't that feature.

### Redis

Use case would be **caching `hash(jd + cv) → ScreeningResult`** to avoid re-running the LLM, or **rate-limiting per conversation**. Rejected because:

- The single Next.js process means a Redis cache provides no benefit over a Postgres SELECT. The advantage of Redis is *shared* state across pods; we have one pod.
- Anthropic's prompt cache already handles the LLM-side cost discipline (see [ADR 0007](0007-tool-use-with-zod-for-structured-output.md) — `cache_control: ephemeral`).
- Rate limiting at this scale is solved by trusting the cookie; abusive traffic would be a feature-gate / API-key problem, not an in-process cache problem.

See [ADR 0008](0008-no-in-memory-result-cache.md) for the more specific "no in-memory result cache" rationale.

The right time to add pgvector: when the bot stores a corpus of past screenings and the user wants semantic search. The right time to add Redis: when the bot runs in multiple pods and needs shared session / rate-limit / idempotency state.

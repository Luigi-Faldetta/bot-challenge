# ADR 0008 — No in-memory result cache

- **Status**: Accepted
- **Date**: 2026-05-21

## Context

A `ScreeningResult` is the LLM output for a `(JD, CV)` pair. If two conversations submit the same JD and CV, the LLM cost is paid twice. A common pattern is:

```
hash(jd + cv) → ScreeningResult
```

Stored in a process-local Map or in Redis with a TTL. Hits the cache → return immediately; misses → call the LLM.

## Decision

No in-memory result cache, no Redis cache. Every screening request hits Anthropic.

## Consequences

**Wins**:

- One fewer code path to test. The result cache would need a test for "cache hit returns the stored result without calling the provider" and "cache miss falls through to the provider" — both worth maintaining only if the cache actually pays off.
- No invalidation logic. JD wording changes, candidate scoring changes, system prompt changes — none of those require cache busting because there's no cache.
- The flow stays linear: request → LLM → response → save. Easy to explain.

**Costs**:

- A user re-submitting the same JD and CV pays the LLM cost again. At a take-home, this happens essentially never; in production it would be worth a real cache.

## Alternatives considered

- **In-process Map cache** (`Map<string, ScreeningResult>` keyed by `hash(jd + cv)`) — rejected because:
  - Single-pod demo doesn't benefit. Cache lifetime = process lifetime; restart wipes it. No measurable hit rate at this scale.
  - Adds a code path tested by nothing meaningful (we'd have to add tests just to justify it).
  - Anthropic's **prompt cache** already covers the cost-saving angle for repeated JDs (see [ADR 0007](0007-tool-use-with-zod-for-structured-output.md) — two `cache_control` breakpoints).
- **Redis cache with TTL** — rejected because:
  - Same single-pod argument. Plus adds Redis to the ops surface (see [ADR 0004](0004-no-pgvector-no-redis.md)).
- **Postgres cache table** (`screening_cache(hash, result_json, created_at)`) — same arguments. Plus Postgres without an in-memory layer in front is roughly the same cost as just running the LLM at our scale.

If this code moved to production with N pods and a hot screening workload, the right cache is **Redis with a 24h TTL**, keyed by `hash(jd + cv)`. The adapter would gain a 5-line check at the top: if hit, return; otherwise call provider and write back. The use case wouldn't change.

The mental model: **build the cache when the metric ("LLM calls per second" or "wasted Anthropic spend") says you need it.** Premature caching adds an entire failure mode (stale data, invalidation bugs) for no measurable win.

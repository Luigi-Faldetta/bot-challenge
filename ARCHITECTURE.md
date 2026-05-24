# Architecture

A conversational screening bot that drives a finite state machine through three states — `IDLE`, `SCREENING`, `JOB_BUILDER` — to compare a job description against a candidate CV via Claude. Built as a demonstration of clean architecture (DDD + hexagonal). The reviewer is a senior engineer who values defensible choices over feature volume; this document is the map of those choices.

Per-decision rationale lives in [`docs/adr/`](docs/adr/). This file is the high-level tour.

## Bounded contexts

Two contexts, each with its own ubiquitous language:

| Context | Aggregate | Responsibility |
|---|---|---|
| `conversation` | `Conversation` | The FSM state, the message log, the events the bot reacts to. |
| `screening` | `ScreeningResult` | Comparing a JD against a CV via the LLM; the score and structured analysis it produces. |

The contexts are deliberately separated. The conversation layer never imports `MatchScore` directly; it sees the screening result as an opaque value coming back from the `RunScreening` use case. Crossing contexts goes through ports (`ScreeningProvider`, `ScreeningRepository`, etc.), never direct module imports.

## Layers inside each context

Each bounded context follows the same four-layer layout:

```
src/modules/<context>/
├── domain/          ← pure, framework-free
│   ├── *.ts         (aggregate, value objects, state types, events)
│   └── ports/       (interfaces the domain depends on)
├── application/     ← orchestration: use cases
│   └── *.ts
└── infrastructure/  ← adapters that implement the domain ports
    └── *.ts
```

Presentation lives separately under `src/app/` (Next.js route handlers + React components).

The dependency arrows only point one way: **presentation → application → domain ← infrastructure**. Domain has no outbound dependencies on any other layer or on any framework. Use cases depend on domain ports; infrastructure implements them. ESLint's `no-restricted-imports` rule fails the build if anyone reaches across these arrows — the architecture is enforced as code, not as convention.

See [ADR 0001](docs/adr/0001-plain-ts-fsm-over-langgraph.md) for the FSM rationale; the dependency rule itself lives in `eslint.config.mjs`.

## Composition root

`src/shared/infrastructure/composition-root.ts` is the **only place** where real adapter classes are instantiated and wired into use cases. Route handlers import the wired-up singletons from here; tests bypass this module entirely and construct use cases with in-memory fakes.

```ts
// Excerpt from composition-root.ts
const conversationRepo = new PostgresConversationRepository(db);
const screeningProvider = new AnthropicScreeningProvider({ apiKey: env().ANTHROPIC_API_KEY });
// ...
export const handleUserMessage = new HandleUserMessage({
  conversations: conversationRepo,
  runScreening,
  intentClassifier,
  now,
  newId,
});
```

No DI container, no decorator framework. Each use case's constructor takes a `Deps` object; the composition root supplies it. This is what people mean when they say "hexagonal doesn't need a DI framework."

## The state machine

The conversation FSM is the spine of the bot:

- Three states as a TypeScript discriminated union: `IDLE`, `SCREENING` (with `AWAITING_JD` / `AWAITING_CV` / `PROCESSING` substeps), `JOB_BUILDER`.
- One pure function: `transition(state, event) → state` in `src/modules/conversation/domain/transitions.ts` (96 lines).
- **Total**: every combination of state and event has a defined outcome. No throws, no `Result` wrapper. No-ops return the same state by reference.
- Twenty-five table-driven test rows in `transitions.test.ts` cover every cell.
- Exhaustiveness compile-time enforced via `const _exhaustive: never = state` in every union switch.

See [ADR 0001](docs/adr/0001-plain-ts-fsm-over-langgraph.md) for the choice of plain TypeScript over LangGraph / XState.

## LLM integration

Two LLM calls, both behind ports:

| Port | Adapter | Model | Purpose |
|---|---|---|---|
| `ScreeningProvider` | `AnthropicScreeningProvider` | Claude Sonnet 4.6 | JD ↔ CV comparison, structured tool output |
| `IntentClassifier` | `AnthropicIntentClassifier` | Claude Haiku 4.5 | Natural-language intent classification (4 classes) |

Both adapters apply the same three-layer pattern:

1. **`tool_use` with forced `tool_choice`** — Claude returns a `tool_use` block whose `input` conforms to a declared JSON Schema. No prose escape hatch.
2. **Zod validation at the boundary** — re-validates the tool input on our side; a malformed response becomes a typed `MALFORMED_RESPONSE` error, not a runtime crash.
3. **`cache_control: ephemeral`** — system prompt is cached on both adapters. The screening provider has a second cache breakpoint after the JD, so re-screening the same role against a different CV cuts input cost roughly in half.

The screening adapter also enforces a domain-level invariant via `MatchScore.create(...)` after Zod validation — triple-layered defence in depth against a hallucinated score.

See:
- [ADR 0003](docs/adr/0003-anthropic-direct-no-langchain.md) — why the Anthropic SDK directly, not LangChain.
- [ADR 0007](docs/adr/0007-tool-use-with-zod-for-structured-output.md) — the three-layer structured-output pattern.
- [ADR 0009](docs/adr/0009-llm-intent-classification-over-regex.md) — why a Haiku intent classifier over regex.

## Persistence model

Postgres 16 in docker-compose (port 5433), accessed via Drizzle ORM. Two tables:

- **`conversations`** — one row per thread. `state` is a `jsonb` column whose shape matches `ConversationState` exactly (no translation layer). Upsert on save (`onConflictDoUpdate` on the id).
- **`chat_messages`** — append-only. PK is the message id; FK is the conversation id. Inserts use `onConflictDoNothing`, so save is idempotent.

The repository (`PostgresConversationRepository`) is the only place where domain shapes touch Drizzle. The save strategy intentionally re-passes the full message list every turn and relies on `onConflictDoNothing` to discard duplicates — snapshot semantics, clean but wasteful at scale. At demo size (<10 messages per conversation) it's invisible; at ~30+ turns we'd switch to dirty-tracking on the aggregate.

See:
- [ADR 0002](docs/adr/0002-drizzle-over-sequelize-and-prisma.md) — Drizzle vs Prisma / Sequelize.
- [ADR 0005](docs/adr/0005-postgres-as-conversation-store.md) — plain Postgres vs event store / Mongo.
- [ADR 0004](docs/adr/0004-no-pgvector-no-redis.md) — why no vector store, no Redis.
- [ADR 0008](docs/adr/0008-no-in-memory-result-cache.md) — why no result cache.

## HTTP surface

Three Next.js Route Handlers under `src/app/api/`:

- `POST /api/conversation/message` — JSON in, JSON out. Thin adapter: parse Zod → call `handleUserMessage.execute(...)` → return reply + new state.
- `POST /api/conversation/message/stream` — same use-case call, but the reply is streamed back as Server-Sent Events (24-char chunks, 18ms apart) so the UI can render with a typewriter effect.
- `POST /api/upload` — multipart upload. Calls the `TextExtractor` port (PDF via `unpdf`, or UTF-8 decode for plain text). Returns the extracted text to the browser, which then re-submits it via the message endpoint. The upload route doesn't know about conversations or the FSM.

A `wf_thread` cookie (`HttpOnly`, `SameSite=Lax`, 7-day max-age) carries the conversation id between requests. There's no auth (see [ADR 0006](docs/adr/0006-no-auth-in-scope.md)).

## Testing strategy

Three rings:

- **Domain** — unit-tested exhaustively with plain values, no fixtures. The transition table has 25 rows; every one is asserted. Value objects (`MatchScore`) and aggregates (`Conversation`, `ScreeningResult`) have their invariants tested directly.
- **Application** — unit-tested with in-memory port fakes. No DB, no LLM, no HTTP. Use cases test like pure functions because their dependencies are injected.
- **Infrastructure** —
  - **Postgres adapters**: integration tests against a real docker-compose Postgres. Tests apply migrations, run real SQL, assert on real rows.
  - **Anthropic adapters**: unit-tested with the SDK mocked at the boundary. Live LLM calls in CI are expensive and non-deterministic; the recorded-cassette pattern is overkill for a take-home.

The UI is **not** unit-tested — snapshot tests on chat bubbles are low-yield for an architecture-graded demo.

## Out-of-scope (deliberately)

- **Authentication.** Cookie-bound thread id only. Auth would slot behind a port. See [ADR 0006](docs/adr/0006-no-auth-in-scope.md).
- **Multi-pod / horizontal scale.** The composition root is module-scoped — fine for a single Next.js process; would need rework for clustered deploys.
- **LLM eval harness.** Today three CVs are tested manually. A proper eval would be a labelled corpus of ~50 (JD, CV, expected_band) triples plus a nightly regression check.
- **Real CI.** A GitHub Actions workflow running `typecheck`, `lint`, and `test` on push is ~30 lines; deferred for time.
- **Persistent conversation history across devices.** Cookie-bound only; no user accounts means no cross-device thread.

## Architecture Decision Records

Each non-trivial decision is recorded as a one-page ADR. Format: **Context · Decision · Consequences · Alternatives considered**.

| # | Topic |
|---|---|
| [0001](docs/adr/0001-plain-ts-fsm-over-langgraph.md) | Plain TS FSM, not LangGraph or XState |
| [0002](docs/adr/0002-drizzle-over-sequelize-and-prisma.md) | Drizzle ORM, not Sequelize or Prisma |
| [0003](docs/adr/0003-anthropic-direct-no-langchain.md) | Anthropic SDK directly, not LangChain |
| [0004](docs/adr/0004-no-pgvector-no-redis.md) | No pgvector, no Redis |
| [0005](docs/adr/0005-postgres-as-conversation-store.md) | Postgres as the conversation store |
| [0006](docs/adr/0006-no-auth-in-scope.md) | No auth in scope |
| [0007](docs/adr/0007-tool-use-with-zod-for-structured-output.md) | `tool_use` + Zod for structured output |
| [0008](docs/adr/0008-no-in-memory-result-cache.md) | No in-memory result cache |
| [0009](docs/adr/0009-llm-intent-classification-over-regex.md) | LLM intent classification, not regex |

## Quick map of the repo

```
src/
├── app/                              Next.js App Router (presentation)
│   ├── api/
│   │   ├── conversation/message/     JSON + SSE route handlers
│   │   └── upload/                   multipart upload route
│   └── components/chat/              chat UI, SSE consumer
├── modules/
│   ├── conversation/
│   │   ├── domain/                   aggregate, FSM, events, ports
│   │   ├── application/              HandleUserMessage use case
│   │   └── infrastructure/           Postgres repo, Anthropic intent classifier
│   └── screening/
│       ├── domain/                   ScreeningResult, MatchScore, ports
│       ├── application/              RunScreening use case, reply formatters
│       └── infrastructure/           Postgres repo, Anthropic provider, PDF extractor
└── shared/
    ├── domain/                       Entity, ValueObject, Result base types
    └── infrastructure/               db client, env validation, composition root
```

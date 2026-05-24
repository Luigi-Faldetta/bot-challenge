# Workfully — Conversational screening bot

A conversational screening bot built as the Workfully Senior Fullstack (Applied AI) take-home. Drives a three-state finite state machine (`IDLE` / `SCREENING` / `JOB_BUILDER`) to compare a candidate CV against a job description via Claude. The build is a demonstration of clean architecture (DDD + hexagonal) and pragmatic LLM integration, not a product.

> For the full architectural tour, read [`ARCHITECTURE.md`](ARCHITECTURE.md). For per-decision rationale, read [`docs/adr/`](docs/adr/) — nine one-page ADRs cover every non-trivial call.

## Quick start

Requires Node 20+, Docker, and an Anthropic API key.

```sh
git clone https://github.com/Luigi-Faldetta/bot-challenge.git
cd bot-challenge
npm install
cp .env.example .env.local          # then add ANTHROPIC_API_KEY=sk-ant-...
docker compose up -d                # Postgres 16 on port 5433 (5432 was taken locally)
npm run db:push                     # apply Drizzle schema
npm run dev                         # then open http://localhost:3000
```

Type `/screen`, paste a job description, paste a CV, and the bot returns a structured match report.

## Key design decisions

The brief asks for four explicit decisions to be defended. Short answers below; depth lives in the linked ADRs and [`ARCHITECTURE.md`](ARCHITECTURE.md).

### 1. How the state machine was implemented

Plain TypeScript discriminated-union state plus one pure `transition(state, event) → state` function. **Total** — every combination of state and event has a defined outcome, no throws. Exhaustiveness is compile-time enforced via `const _exhaustive: never = state` in every union switch; adding a fourth state breaks the build until every case is handled. Twenty-five table-driven test rows cover the entire FSM. No LangGraph, no XState — the FSM **is** the architectural artefact being graded, so it stays visible in 96 lines of [`src/modules/conversation/domain/transitions.ts`](src/modules/conversation/domain/transitions.ts).

→ [ADR 0001](docs/adr/0001-plain-ts-fsm-over-langgraph.md) · [ARCHITECTURE.md § The state machine](ARCHITECTURE.md#the-state-machine)

### 2. The architecture and why

Bounded-context-first hexagonal. Two contexts (`conversation/`, `screening/`), each split into `domain/` → `application/` → `infrastructure/`; presentation lives separately under `src/app/`. The dependency rule (`presentation → application → domain ← infrastructure`) is **enforced by ESLint**, not by convention: [`eslint.config.mjs`](eslint.config.mjs) declares `no-restricted-imports` rules that fail the build if a domain file imports infrastructure, or an application file imports framework code. Architecture as code, not as design doc.

→ [ARCHITECTURE.md § Layers](ARCHITECTURE.md#layers-inside-each-context)

### 3. What database and why

Postgres 16 via Drizzle ORM. Two tables: `conversations` (one row per thread, `state` stored as a `jsonb` column whose shape **is** the domain `ConversationState` type — no translation layer) and `chat_messages` (append-only, idempotent inserts via `onConflictDoNothing`). Drizzle over Prisma (no codegen step, schema-as-TypeScript) and over Sequelize (much stronger type inference). No pgvector — single JD vs single CV, no corpus to index. No Redis — single-pod demo, Anthropic's prompt cache handles the cost-saving angle.

→ [ADR 0002](docs/adr/0002-drizzle-over-sequelize-and-prisma.md) · [ADR 0005](docs/adr/0005-postgres-as-conversation-store.md) · [ADR 0004](docs/adr/0004-no-pgvector-no-redis.md)

### 4. What was tested and why

Three rings:

- **Domain** — unit-tested exhaustively with plain values, no fixtures. The 25-row transition table, every value object's invariants, every aggregate factory.
- **Application** — unit-tested with in-memory port fakes. No DB, no LLM, no HTTP. Use cases test like pure functions because their dependencies are injected.
- **Infrastructure** — Postgres adapters get real integration tests against the dockerised database (`npm run test:int`); the Anthropic adapters are unit-tested with the SDK mocked at the boundary. Live LLM calls in CI are expensive and non-deterministic; not worth a recorded-cassette setup for a take-home.

UI is deliberately not snapshot-tested — low yield for an architecture-graded demo. Current count: **123 unit tests across 12 suites**, plus 10 integration tests under `tests/integration/`.

→ [ARCHITECTURE.md § Testing strategy](ARCHITECTURE.md#testing-strategy)

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server on http://localhost:3000 |
| `npm run typecheck` | TypeScript compile check (no emit) |
| `npm run lint` | ESLint, including the hexagonal dependency rule |
| `npm test` | Unit tests — fast, offline (~1 second) |
| `npm run test:int` | Integration tests against the dockerised Postgres |
| `npm run db:push` | Apply Drizzle schema to the running database |
| `npm run db:studio` | Open Drizzle Studio for inspecting the database |
| `npm run build` | Production build (sanity check) |

## What I'd do differently with more time

- **Live LLM eval harness** — labelled corpus of ~50 `(JD, CV, expected_band)` triples + nightly regression check. Today, three CVs were tested manually.
- **Real CI** — GitHub Actions running `typecheck`, `lint`, `test` on push. Roughly a 30-line workflow file; deferred for time.
- **Auth0 behind an auth port** — would slot in cleanly per [ADR 0006](docs/adr/0006-no-auth-in-scope.md); the use cases wouldn't change a line.
- **Dirty-tracking on the conversation aggregate** — current `save()` re-inserts the full message list every turn and relies on `onConflictDoNothing`. Snapshot semantics, clean but wasteful past ~30 turns. Discussed in [ADR 0005](docs/adr/0005-postgres-as-conversation-store.md).
- **AWS deploy** — currently runs locally; would deploy behind Vercel or ECS/Fargate for a public demo.

---

## The original brief (for context)

> We want to see how you code and how you make decisions. For that:
> We'd like you to explain, architecture patterns, good practices, your testing strategy.

### Objective

Build a conversational bot powered by a finite state machine (FSM) that can:

1. Greet users and offer help
2. **Screen a candidate against a specific job description**
3. Guide a company through building a job description (mocked output; you don't need to build this)

### State Machine

```
┌─────────────┐
│    IDLE      │  ← Default. "I'm here to help."
│  (State 1)   │
└──────┬───┬──┘
       │   │
       │   └──────────────────────┐
       ▼                          ▼
┌──────────────┐          ┌───────────────┐
│  SCREENING   │          │  JOB_BUILDER  │
│  (State 2)   │          │  (State 3)    │
└──────┬───────┘          └──────┬────────┘
       │                         │
       │   ← /cancel or done →   │
       ▼                         ▼
    IDLE                      IDLE
```

| From        | To          | Trigger                                     |
| ----------- | ----------- | ------------------------------------------- |
| IDLE        | SCREENING   | User says "screen a candidate" or `/screen` |
| IDLE        | JOB_BUILDER | User says "create a job" or `/newjob`       |
| SCREENING   | IDLE        | Screening complete or `/cancel`             |
| JOB_BUILDER | IDLE        | Builder complete or `/cancel`               |

### Screening flow detail

1. User triggers screening → state = `SCREENING`
2. Bot asks: _"Select or Paste or upload the job description."_
3. User provides JD
4. Bot asks: _"Now paste or upload the candidate's CV."_
5. User provides CV

If the user sends `/cancel` at step 2–5, state resets to IDLE.

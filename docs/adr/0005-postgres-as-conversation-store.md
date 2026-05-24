# ADR 0005 — Postgres as the conversation store

- **Status**: Accepted
- **Date**: 2026-05-21

## Context

The conversation aggregate needs to be persistent. The bot uses an `httpOnly` cookie (`wf_thread`) as the thread id; on every request the use case loads the conversation by id, mutates it, and saves it back. Storage options:

- **Plain Postgres tables**: one row per conversation (state column + message rows in a related table).
- **Event store** (e.g. Postgres + EventStoreDB / Marten patterns): append-only event log; the aggregate is rebuilt by replaying events.
- **Document store** (e.g. MongoDB): one document per conversation, full snapshot per write.

## Decision

Plain Postgres, two tables:

- `conversations` — one row per thread. Primary key is the conversation id. The `state` column is `jsonb` and stores the discriminated-union `ConversationState` verbatim.
- `chat_messages` — one row per message. PK is the message id; FK is the conversation id; `createdAt` for ordering.

The repository upserts the conversation row on every save (`onConflictDoUpdate` on the id) and inserts every message with `onConflictDoNothing` (idempotent — calling save twice is safe).

## Consequences

**Wins**:

- The `state` JSONB column shape **is** the domain `ConversationState` type. No translation layer between domain and storage; `Conversation.rebuild` consumes `row.state as ConversationState` directly.
- Two tables. Easy to reason about, easy to inspect from `psql`.
- Append-only messages preserve the full conversation log for the UI to render.

**Costs**:

- The `save` strategy re-passes every message in the aggregate to `onConflictDoNothing` every turn — wasteful at scale. At demo size (<10 messages per conversation), invisible. At ~30+ turns it would become measurable, and we'd switch to dirty-tracking on the aggregate (only insert messages whose ids aren't already in the DB).
- The JSONB column has no schema enforcement at the DB level. If we ever change the shape of `ConversationState`, old rows might still hold the old shape. Acceptable here because we control all writers; in a real product we'd ship a migration that normalises the JSON.

## Alternatives considered

- **Event store** — would give us a perfect audit trail and the ability to replay history. Rejected because:
  - We don't need replay. The conversation state is small and there's no business reason to recompute past states.
  - Adds significant complexity (event schemas, projection logic) for no demo benefit.
  - The interview is graded on the FSM, not on the persistence model.
- **MongoDB / document store** — would naturally store the full snapshot per conversation. Rejected because:
  - Two stores (Postgres for screenings, Mongo for conversations) is more ops surface than one. We need Postgres anyway (the screening table lives there).
  - JSONB in Postgres gives us 95% of the "document store" wins (schemaless writes, native JSON queries) inside the same database.

The decision is: **use the boring database in the boring way and put the interesting logic in the domain.**

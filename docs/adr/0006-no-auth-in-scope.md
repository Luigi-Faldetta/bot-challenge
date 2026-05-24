# ADR 0006 — No auth in scope

- **Status**: Accepted
- **Date**: 2026-05-21

## Context

The brief doesn't mention authentication. Workfully's stack includes Auth0; the senior reviewer will ask whether the bot's missing auth is a gap or a deliberate choice.

The bot needs *some* notion of "which conversation is this user in" to load the right aggregate from Postgres. Options:

- **Cookie-bound thread id** — `httpOnly` cookie holds a UUID; that's the conversation id.
- **Anonymous session via cookie + per-session ID issued server-side** — same shape, more ceremony.
- **Full auth via Auth0 / NextAuth.js / etc.** — user accounts, login flow, token validation.

## Decision

Cookie-bound thread id only. No user accounts, no Auth0, no login.

- The cookie is `wf_thread`, `HttpOnly`, `SameSite=Lax`, 7-day max-age.
- Route handlers read the cookie; if absent, mint a UUID and `Set-Cookie` it.
- The thread id is the conversation id, period.

## Consequences

**Wins**:

- Zero auth surface to defend in a take-home. No JWT validation, no refresh tokens, no callback URLs.
- The architecture stays focused on what's being graded (FSM + DDD + hexagonal + LLM integration).
- The cookie pattern is honest about the bot's scope — it's a demo, not a logged-in product.

**Costs**:

- The conversation is bound to the browser/device. Different device = different conversation.
- No notion of "screenings I ran last week"; the user can't search their history.
- Anyone with the cookie value can resume the conversation. Mitigated by `HttpOnly` (no JS access) and the cookie's effective opacity (UUID, unguessable).

## Alternatives considered

- **Auth0 / NextAuth.js** — would give us real users, persistent identity, and the ability to share screenings across devices. Rejected because:
  - Implementing it would consume ~half a day that should go into the FSM, the LLM integration, and the ADRs.
  - It would not change the architecture demonstrably — auth would slot behind an **auth port** the same way Anthropic slots behind the `ScreeningProvider` port. The dependency rule and the use cases would be identical.
- **NextAuth.js with credential provider + Postgres adapter** — lighter than Auth0 but still ~150 lines and a new schema. Same rejection reasoning.

If this code moved into Workfully's main codebase, Auth0 would slot in as: a route-handler middleware extracts `request.auth.userId`; the use case takes a `userId` argument; the conversation repository scopes queries to that `userId`; the cookie is removed. The hexagonal architecture means none of the domain or application code changes.

**Interview answer:** *"Auth0 would fit behind a thin auth port the same way Anthropic fits behind the screening-provider port. The use case is unchanged; the route handler reads `request.auth.userId` instead of the cookie."*

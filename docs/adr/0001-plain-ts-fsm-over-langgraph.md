# ADR 0001 — Plain TypeScript FSM, not LangGraph or XState

- **Status**: Accepted
- **Date**: 2026-05-21

## Context

The brief asks for a "conversational bot driving a finite state machine" — three states (`IDLE` / `SCREENING` / `JOB_BUILDER`), with a screening sub-flow that gathers a JD and a CV before triggering the LLM call. The state machine is **the architectural artefact being graded**: every interviewer will open `transitions.ts` and probe it.

Two framework options exist for FSMs in this kind of agent code:

- **LangGraph** — graph-driven agent runtime. Built for LLM-routed transitions.
- **XState** — generic state-chart library. Battle-tested, declarative, includes a visualiser.

Both ship the same FSM behaviour as plain TypeScript, plus more.

## Decision

Implement the FSM as a plain TypeScript discriminated-union state plus a pure `transition(state, event) → state` function. No external state-machine library.

- States: `ConversationState` discriminated union (`IDLE` | `SCREENING` with substeps + stored `jd`/`cv` | `JOB_BUILDER`).
- Events: `ConversationEvent` discriminated union (`USER_MESSAGE` | `COMMAND` | `SCREENING_COMPLETED`).
- The transition function is **total**: every combination of state and event has a defined outcome. No-ops return the same state by reference. No throws, no `Result` wrapper.
- Exhaustiveness is compile-time enforced via `const _exhaustive: never = state` in the default branch of every union switch.

## Consequences

**Wins**:

- The FSM is visible. A reviewer can read the entire state machine in 96 lines (`transitions.ts`).
- It's testable as a pure function with plain values: `transition({ kind: "IDLE" }, { type: "COMMAND", command: "screen" })`. Twenty-five table-driven test rows cover every cell.
- Adding a fourth state forces every switch to handle it (the `never` assignment fails to type-check), so refactors stay safe.
- No runtime dependency on a state-machine library.

**Costs**:

- No visualiser. Anyone wanting a state diagram has to draw one (the README contains an ASCII diagram instead).
- If transitions ever become LLM-driven (e.g. an agent deciding which step comes next), we'd want to revisit this.

## Alternatives considered

- **LangGraph** — The cost of adopting it is one library, one runtime, and an architectural framing where the agent owns the routing decisions. We don't have LLM-driven routing here; all transitions are deterministic on user input. LangGraph hides the FSM rather than exposes it, which is the wrong shape for an architecture-graded take-home.
- **XState** — Adds a declarative DSL (`createMachine({ ... })`), visualiser, and machine-as-data benefits. We don't need any of those at this scale, and the visualiser tools are external services. The plain TS version is 96 lines; the XState version would be ~200 lines of config plus a runtime dependency, with no functional gain at our state count.
- **Class-based FSM with `transition()` as a method on `Conversation`** — works, but the test setup becomes "construct an aggregate first". Pure function is cleaner: fewer fixtures, faster tests, easier to reason about.

The right time to reach for LangGraph or XState is when transitions themselves become non-deterministic (an LLM deciding which state to go to next). That's not this bot.

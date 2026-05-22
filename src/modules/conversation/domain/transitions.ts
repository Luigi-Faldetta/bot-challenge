// Pure transition function for the conversation FSM.
//
// (state, event) → state. Total: every event in every state has a defined
// outcome (no thrown errors, no Result wrapper). Events that have no effect
// in the current state return the same state object — by reference is fine,
// the function is pure either way.
//
// The application layer is responsible for parsing user input into the right
// event (USER_MESSAGE vs COMMAND). The FSM trusts whatever it's given.

import type { ConversationState } from "./state";
import type { ConversationEvent } from "./events";

export function transition(
  state: ConversationState,
  event: ConversationEvent,
): ConversationState {
  switch (state.kind) {
    case "IDLE":
      return fromIdle(state, event);
    case "SCREENING":
      return fromScreening(state, event);
    case "JOB_BUILDER":
      return fromJobBuilder(state, event);
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function fromIdle(
  state: ConversationState & { kind: "IDLE" },
  event: ConversationEvent,
): ConversationState {
  if (event.type === "COMMAND") {
    switch (event.command) {
      case "screen":
        return { kind: "SCREENING", step: "AWAITING_JD" };
      case "newjob":
        return { kind: "JOB_BUILDER" };
      case "cancel":
        return state;
    }
  }
  // USER_MESSAGE and SCREENING_COMPLETED are no-ops in IDLE.
  return state;
}

function fromScreening(
  state: ConversationState & { kind: "SCREENING" },
  event: ConversationEvent,
): ConversationState {
  if (event.type === "COMMAND" && event.command === "cancel") {
    return { kind: "IDLE" };
  }
  if (event.type === "SCREENING_COMPLETED" && state.step === "PROCESSING") {
    return { kind: "IDLE" };
  }
  if (event.type === "USER_MESSAGE") {
    if (state.step === "AWAITING_JD") {
      return { kind: "SCREENING", step: "AWAITING_CV", jd: event.text };
    }
    if (state.step === "AWAITING_CV") {
      return {
        kind: "SCREENING",
        step: "PROCESSING",
        jd: state.jd,
        cv: event.text,
      };
    }
    // PROCESSING — ignore user messages until the LLM returns.
  }
  // /screen, /newjob, and out-of-order SCREENING_COMPLETED are no-ops here.
  return state;
}

function fromJobBuilder(
  state: ConversationState & { kind: "JOB_BUILDER" },
  event: ConversationEvent,
): ConversationState {
  // JOB_BUILDER is a real one-turn state. The README defines two exits:
  //   - /cancel  → IDLE
  //   - "Builder complete" → IDLE. We mock this as "any free-text message",
  //     since a real implementation would ask questions and read answers.
  // Other commands (/screen, /newjob) and out-of-order SCREENING_COMPLETED
  // are no-ops; the user has to /cancel or send a message to leave.
  if (event.type === "COMMAND" && event.command === "cancel") {
    return { kind: "IDLE" };
  }
  if (event.type === "USER_MESSAGE") {
    return { kind: "IDLE" };
  }
  return state;
}

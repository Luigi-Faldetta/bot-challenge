// Exhaustive transition table for the conversation FSM.
//
// Every (state, event) combination is covered. If you change `transitions.ts`
// and a row here goes red, the change is either a real behaviour shift (update
// the table with a comment) or a regression (revert the change).

import { transition } from "@/modules/conversation/domain/transitions";
import type { ConversationState } from "@/modules/conversation/domain/state";
import type { ConversationEvent } from "@/modules/conversation/domain/events";

const idle: ConversationState = { kind: "IDLE" };
const awaitingJd: ConversationState = { kind: "SCREENING", step: "AWAITING_JD" };
const awaitingCv = (jd = "the JD"): ConversationState => ({
  kind: "SCREENING",
  step: "AWAITING_CV",
  jd,
});
const processing = (
  jd = "the JD",
  cv = "the CV",
): ConversationState => ({
  kind: "SCREENING",
  step: "PROCESSING",
  jd,
  cv,
});
const jobBuilder: ConversationState = { kind: "JOB_BUILDER" };

const userMsg = (text = "hello"): ConversationEvent => ({
  type: "USER_MESSAGE",
  text,
});
const cmd = (command: "screen" | "newjob" | "cancel"): ConversationEvent => ({
  type: "COMMAND",
  command,
});
const completed: ConversationEvent = { type: "SCREENING_COMPLETED" };

type Row = {
  desc: string;
  state: ConversationState;
  event: ConversationEvent;
  expected: ConversationState;
};

const table: Row[] = [
  // ─── From IDLE ────────────────────────────────────────────────────────────
  {
    desc: "IDLE + /screen → SCREENING/AWAITING_JD",
    state: idle,
    event: cmd("screen"),
    expected: awaitingJd,
  },
  {
    desc: "IDLE + /newjob → JOB_BUILDER",
    state: idle,
    event: cmd("newjob"),
    expected: jobBuilder,
  },
  {
    desc: "IDLE + /cancel → IDLE (no-op)",
    state: idle,
    event: cmd("cancel"),
    expected: idle,
  },
  {
    desc: "IDLE + free text → IDLE (no-op; bot offers help)",
    state: idle,
    event: userMsg(),
    expected: idle,
  },
  {
    desc: "IDLE + SCREENING_COMPLETED → IDLE (out-of-order, no-op)",
    state: idle,
    event: completed,
    expected: idle,
  },

  // ─── From SCREENING / AWAITING_JD ─────────────────────────────────────────
  {
    desc: "AWAITING_JD + free text → AWAITING_CV (jd captured)",
    state: awaitingJd,
    event: userMsg("here is the JD"),
    expected: {
      kind: "SCREENING",
      step: "AWAITING_CV",
      jd: "here is the JD",
    },
  },
  {
    desc: "AWAITING_JD + /cancel → IDLE",
    state: awaitingJd,
    event: cmd("cancel"),
    expected: idle,
  },
  {
    desc: "AWAITING_JD + /screen → AWAITING_JD (no-op, already screening)",
    state: awaitingJd,
    event: cmd("screen"),
    expected: awaitingJd,
  },
  {
    desc: "AWAITING_JD + /newjob → AWAITING_JD (no-op; app layer warns user)",
    state: awaitingJd,
    event: cmd("newjob"),
    expected: awaitingJd,
  },
  {
    desc: "AWAITING_JD + SCREENING_COMPLETED → AWAITING_JD (out-of-order, no-op)",
    state: awaitingJd,
    event: completed,
    expected: awaitingJd,
  },

  // ─── From SCREENING / AWAITING_CV ─────────────────────────────────────────
  {
    desc: "AWAITING_CV + free text → PROCESSING (cv captured, jd preserved)",
    state: awaitingCv("the JD"),
    event: userMsg("the CV"),
    expected: {
      kind: "SCREENING",
      step: "PROCESSING",
      jd: "the JD",
      cv: "the CV",
    },
  },
  {
    desc: "AWAITING_CV + /cancel → IDLE",
    state: awaitingCv(),
    event: cmd("cancel"),
    expected: idle,
  },
  {
    desc: "AWAITING_CV + /screen → AWAITING_CV (no-op)",
    state: awaitingCv(),
    event: cmd("screen"),
    expected: awaitingCv(),
  },
  {
    desc: "AWAITING_CV + /newjob → AWAITING_CV (no-op)",
    state: awaitingCv(),
    event: cmd("newjob"),
    expected: awaitingCv(),
  },
  {
    desc: "AWAITING_CV + SCREENING_COMPLETED → AWAITING_CV (out-of-order, no-op)",
    state: awaitingCv(),
    event: completed,
    expected: awaitingCv(),
  },

  // ─── From SCREENING / PROCESSING ──────────────────────────────────────────
  {
    desc: "PROCESSING + SCREENING_COMPLETED → IDLE",
    state: processing(),
    event: completed,
    expected: idle,
  },
  {
    desc: "PROCESSING + /cancel → IDLE",
    state: processing(),
    event: cmd("cancel"),
    expected: idle,
  },
  {
    desc: "PROCESSING + free text → PROCESSING (ignored mid-LLM)",
    state: processing(),
    event: userMsg("hello?"),
    expected: processing(),
  },
  {
    desc: "PROCESSING + /screen → PROCESSING (no-op)",
    state: processing(),
    event: cmd("screen"),
    expected: processing(),
  },
  {
    desc: "PROCESSING + /newjob → PROCESSING (no-op)",
    state: processing(),
    event: cmd("newjob"),
    expected: processing(),
  },

  // ─── From JOB_BUILDER (real one-turn stub) ────────────────────────────────
  // Two exits per README: "Builder complete" (mocked as any USER_MESSAGE)
  // or /cancel. Everything else is a no-op so the user can't accidentally
  // jump straight from JOB_BUILDER into SCREENING without exiting first.
  {
    desc: "JOB_BUILDER + free text → IDLE (mocked 'builder complete')",
    state: jobBuilder,
    event: userMsg(),
    expected: idle,
  },
  {
    desc: "JOB_BUILDER + /cancel → IDLE",
    state: jobBuilder,
    event: cmd("cancel"),
    expected: idle,
  },
  {
    desc: "JOB_BUILDER + /screen → JOB_BUILDER (no-op; must exit first)",
    state: jobBuilder,
    event: cmd("screen"),
    expected: jobBuilder,
  },
  {
    desc: "JOB_BUILDER + /newjob → JOB_BUILDER (no-op; already in builder)",
    state: jobBuilder,
    event: cmd("newjob"),
    expected: jobBuilder,
  },
  {
    desc: "JOB_BUILDER + SCREENING_COMPLETED → JOB_BUILDER (out-of-order, no-op)",
    state: jobBuilder,
    event: completed,
    expected: jobBuilder,
  },
];

describe("transition", () => {
  test.each(table)("$desc", ({ state, event, expected }) => {
    expect(transition(state, event)).toEqual(expected);
  });

  it("is pure — does not mutate the input state", () => {
    const before: ConversationState = {
      kind: "SCREENING",
      step: "AWAITING_JD",
    };
    const snapshot = JSON.stringify(before);
    transition(before, { type: "USER_MESSAGE", text: "the JD" });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("preserves the JD when CV is received (no data loss in transitions)", () => {
    const next = transition(awaitingCv("Senior Backend Engineer at Acme"), {
      type: "USER_MESSAGE",
      text: "6 years of TypeScript, NestJS, Postgres...",
    });
    if (next.kind !== "SCREENING" || next.step !== "PROCESSING") {
      throw new Error("expected PROCESSING state");
    }
    expect(next.jd).toBe("Senior Backend Engineer at Acme");
    expect(next.cv).toBe("6 years of TypeScript, NestJS, Postgres...");
  });
});

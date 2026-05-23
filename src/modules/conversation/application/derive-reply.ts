// Response copy + the rule for which copy to emit given the resulting
// state, the incoming event, and the previous state. Kept separate from
// the use case because copy and orchestration are different concerns —
// and because the JOB_BUILDER replies need `prevState` to tell "entry"
// from "complete" apart, which is the kind of subtlety worth isolating
// in a pure, exhaustively-tested function.

import type { ConversationEvent } from "@/modules/conversation/domain/events";
import type { ConversationState } from "@/modules/conversation/domain/state";

const JOB_BUILDER_ENTRY =
  "I'd normally guide you through role, seniority, requirements, and perks step by step. For this demo, send any message to receive a sample JD, or /cancel to return to the main menu.";

const JOB_BUILDER_STAYED =
  "You're in the job builder. Send any message to receive a sample JD, or /cancel to return to the main menu.";

const JOB_BUILDER_SAMPLE_JD = `Here's a sample job description (mocked output — a real flow would generate this from your answers):

**Senior Software Engineer — [Your Company]**
**Location:** Remote / Barcelona (EU timezone)
**Stack:** TypeScript, React, NestJS, PostgreSQL, AWS

**Requirements:**
- 5+ years of full-stack engineering experience
- Strong proficiency in TypeScript and modern Node.js
- Solid experience with relational databases and cloud infrastructure

**Nice to have:**
- Experience with applied AI / LLMs
- Open-source contributions
- Domain experience in HR-tech or B2B SaaS

Returning to the main menu.`;

export function deriveReply(
  state: ConversationState,
  event: ConversationEvent,
  prevState: ConversationState,
): string {
  switch (state.kind) {
    case "IDLE":
      // Coming out of JOB_BUILDER on a USER_MESSAGE → mocked "builder complete".
      if (prevState.kind === "JOB_BUILDER" && event.type === "USER_MESSAGE") {
        return JOB_BUILDER_SAMPLE_JD;
      }
      if (event.type === "COMMAND" && event.command === "cancel") {
        return "Cancelled. I'm here to help — type /screen to evaluate a candidate, or /newjob to draft a job description.";
      }
      return "I'm here to help. Type /screen to evaluate a candidate against a job description, or /newjob to draft one.";
    case "SCREENING":
      switch (state.step) {
        case "AWAITING_JD":
          return "Sure — paste the job description, or upload it as a PDF.";
        case "AWAITING_CV":
          return "Got it. Now paste the candidate's CV, or upload it as a PDF.";
        case "PROCESSING":
          // The use case replaces this with the actual screening result.
          return "Analyzing the match…";
      }
    case "JOB_BUILDER":
      // First time arriving here (from IDLE) vs. still here after a no-op.
      return prevState.kind === "JOB_BUILDER" ? JOB_BUILDER_STAYED : JOB_BUILDER_ENTRY;
  }
}

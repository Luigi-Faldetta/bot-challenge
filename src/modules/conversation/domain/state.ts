// Conversation FSM state — discriminated union, structural identity.
//
// Three top-level kinds match the challenge brief: IDLE, SCREENING, JOB_BUILDER.
// SCREENING carries its own step machine because the screening flow has real
// internal states the bot reasons about ("did we get the JD yet?", "are we
// waiting on the LLM?"). PROCESSING is the moment between CV-received and the
// LLM returning — /cancel still works during it, which is why it's a state
// and not just a flag on the application layer.

export type ScreeningStep = "AWAITING_JD" | "AWAITING_CV" | "PROCESSING";

export type ConversationState =
  | { readonly kind: "IDLE" }
  | {
      readonly kind: "SCREENING";
      readonly step: ScreeningStep;
      readonly jd?: string;
      readonly cv?: string;
    }
  | { readonly kind: "JOB_BUILDER" };

export const idle = (): ConversationState => ({ kind: "IDLE" });

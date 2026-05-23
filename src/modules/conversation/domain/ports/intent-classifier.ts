// Port for classifying natural-language user input into one of four FSM
// intents. The README's transition table treats natural language as a
// first-class trigger ("User says 'screen a candidate' or /screen"), and a
// regex match on the literal example string is too brittle.
//
// State-aware mapping happens in the use case, not here. This port is
// deliberately stateless — text in, intent out. That way a JD that
// contains the word "screen" can be classified as `screen` without
// accidentally restarting the flow; the use case sees the conversation
// state and demotes the intent to USER_MESSAGE.

import type { Result } from "@/shared/domain/result";

export type Intent = "screen" | "newjob" | "cancel" | "none";

export type IntentClassifierError =
  | { readonly kind: "RATE_LIMITED" }
  | { readonly kind: "UNAVAILABLE" }
  | { readonly kind: "AUTH_FAILED" }
  | { readonly kind: "MALFORMED_RESPONSE"; readonly detail: string }
  | { readonly kind: "UNKNOWN"; readonly detail: string };

export interface IntentClassifier {
  classify(text: string): Promise<Result<Intent, IntentClassifierError>>;
}

// Port for whatever runs the actual JD↔CV comparison. The Anthropic adapter
// is one implementation; tests use a fake. The application layer never sees
// `@anthropic-ai/sdk` or any LLM-specific types.
//
// Errors are modelled as a discriminated union, not thrown, so the use case
// can map each kind to a different bot reply (e.g. "rate limited, try again"
// vs "the upstream LLM is unreachable").

import type { Result } from "@/shared/domain/result";
import type { ScreeningAnalysis } from "../screening-result";

export type ScreeningProviderError =
  | { readonly kind: "RATE_LIMITED" }
  | { readonly kind: "UNAVAILABLE" }
  | { readonly kind: "MALFORMED_RESPONSE"; readonly detail: string }
  | { readonly kind: "AUTH_FAILED" }
  | { readonly kind: "UNKNOWN"; readonly detail: string };

export interface ScreeningProvider {
  /** Run a single JD↔CV comparison. Both inputs are raw text. */
  run(args: {
    jobDescription: string;
    candidateCv: string;
  }): Promise<Result<ScreeningAnalysis, ScreeningProviderError>>;
}

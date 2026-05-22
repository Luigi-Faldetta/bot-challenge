// Port for extracting plain text from an uploaded file. The pdf-parse adapter
// is one implementation; tests use a fake. Keeps the use case unaware of
// PDF specifics so we could swap in Tika / pdfjs / unstructured.io later.
//
// Failure modes are user-input issues — an empty PDF, a scanned/unreadable
// PDF, an oversized file — so they're modelled as Result errors and the use
// case turns each into a friendly bot reply. Stays in the current FSM step
// so the user can retry without re-running /screen.

import type { Result } from "@/shared/domain/result";

export type ExtractionFailure =
  | { readonly kind: "EMPTY" }
  | { readonly kind: "UNREADABLE"; readonly detail: string }
  | { readonly kind: "TOO_LARGE"; readonly sizeBytes: number; readonly maxBytes: number }
  | { readonly kind: "UNSUPPORTED_MIME"; readonly mime: string };

export interface TextExtractor {
  /** Accepts the raw bytes plus the claimed mime/size; returns text or a typed failure. */
  extract(args: {
    bytes: Uint8Array;
    mime: string;
    sizeBytes: number;
  }): Promise<Result<string, ExtractionFailure>>;
}

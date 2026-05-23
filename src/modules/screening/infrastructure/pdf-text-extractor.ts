// PDF/text adapter implementing the TextExtractor port.
//
// `unpdf` over `pdf-parse` because it's actively maintained, ESM-native, and
// doesn't have pdf-parse's "tries to read test files at startup" Next.js bug.
//
// Failure modes match what the bot reply can actually communicate:
//   TOO_LARGE → "that file is too big, paste text or try smaller"
//   UNSUPPORTED_MIME → "I can't read X, paste text or upload a PDF"
//   EMPTY → "no text found, paste it directly"
//   UNREADABLE → "scanned or password-protected, paste it directly"

import { extractText, getDocumentProxy } from "unpdf";
import { ok, err, type Result } from "@/shared/domain/result";
import type {
  TextExtractor,
  ExtractionFailure,
} from "@/modules/screening/domain/ports/text-extractor";

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB — same cap the upload route enforces
const ALLOWED_MIMES = new Set(["application/pdf", "text/plain"]);

export type PdfTextExtractorOptions = {
  maxBytes?: number;
};

export class PdfTextExtractor implements TextExtractor {
  private readonly maxBytes: number;

  constructor(opts: PdfTextExtractorOptions = {}) {
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  async extract(args: {
    bytes: Uint8Array;
    mime: string;
    sizeBytes: number;
  }): Promise<Result<string, ExtractionFailure>> {
    if (args.sizeBytes > this.maxBytes) {
      return err({
        kind: "TOO_LARGE",
        sizeBytes: args.sizeBytes,
        maxBytes: this.maxBytes,
      });
    }

    if (!ALLOWED_MIMES.has(args.mime)) {
      return err({ kind: "UNSUPPORTED_MIME", mime: args.mime });
    }

    let text: string;
    if (args.mime === "text/plain") {
      text = new TextDecoder("utf-8").decode(args.bytes);
    } else {
      try {
        const pdf = await getDocumentProxy(args.bytes);
        const result = await extractText(pdf, { mergePages: true });
        text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
      } catch (e) {
        return err({
          kind: "UNREADABLE",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (text.trim().length === 0) {
      return err({ kind: "EMPTY" });
    }

    return ok(text);
  }
}

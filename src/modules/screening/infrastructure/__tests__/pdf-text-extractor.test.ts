/**
 * @jest-environment node
 */
// Server-side adapter — node env (jsdom doesn't have TextDecoder).
// Tests exercise the size + mime guards with synthetic inputs and the
// happy text/plain path. The PDF parsing path is exercised end-to-end in
// the manual smoke test against the challenge's sample PDFs — we don't
// fixture-pin a real PDF here to keep the test bundle small.

import { PdfTextExtractor } from "@/modules/screening/infrastructure/pdf-text-extractor";
import { isOk, isErr } from "@/shared/domain/result";

const enc = (s: string) => new Uint8Array(Buffer.from(s, "utf-8"));

describe("PdfTextExtractor", () => {
  describe("size guard", () => {
    it("rejects files exceeding maxBytes", async () => {
      const extractor = new PdfTextExtractor({ maxBytes: 1024 });
      const out = await extractor.extract({
        bytes: new Uint8Array(2048),
        mime: "application/pdf",
        sizeBytes: 2048,
      });
      if (!isErr(out)) throw new Error();
      expect(out.error.kind).toBe("TOO_LARGE");
      if (out.error.kind === "TOO_LARGE") {
        expect(out.error.sizeBytes).toBe(2048);
        expect(out.error.maxBytes).toBe(1024);
      }
    });
  });

  describe("mime guard", () => {
    it("rejects unsupported mime types", async () => {
      const extractor = new PdfTextExtractor();
      const out = await extractor.extract({
        bytes: enc("hello"),
        mime: "application/msword",
        sizeBytes: 5,
      });
      if (!isErr(out)) throw new Error();
      expect(out.error.kind).toBe("UNSUPPORTED_MIME");
    });

    it("accepts text/plain", async () => {
      const extractor = new PdfTextExtractor();
      const out = await extractor.extract({
        bytes: enc("Hello world."),
        mime: "text/plain",
        sizeBytes: 12,
      });
      if (!isOk(out)) throw new Error();
      expect(out.value).toBe("Hello world.");
    });

    it("accepts application/pdf (parsing handled by unpdf — smoke-tested manually)", async () => {
      const extractor = new PdfTextExtractor();
      // Real PDF parsing is covered by the manual verification step; here
      // we just confirm the mime check itself passes by exercising the
      // unreadable path on garbage bytes.
      const out = await extractor.extract({
        bytes: enc("not a real PDF"),
        mime: "application/pdf",
        sizeBytes: 14,
      });
      // unpdf should reject these bytes as unreadable, not as bad mime.
      if (!isErr(out)) throw new Error();
      expect(out.error.kind).toBe("UNREADABLE");
    });
  });

  describe("empty content", () => {
    it("rejects whitespace-only text as EMPTY", async () => {
      const extractor = new PdfTextExtractor();
      const out = await extractor.extract({
        bytes: enc("   \n\t  "),
        mime: "text/plain",
        sizeBytes: 8,
      });
      if (!isErr(out)) throw new Error();
      expect(out.error.kind).toBe("EMPTY");
    });
  });
});

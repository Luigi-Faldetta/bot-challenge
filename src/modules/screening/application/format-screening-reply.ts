// Reply formatters for the screening flow. Lives in screening/application
// because it depends on ScreeningResult + ScreeningProviderError shapes; the
// conversation context never sees those types.

import type { ScreeningResult } from "@/modules/screening/domain/screening-result";
import type { ScreeningProviderError } from "@/modules/screening/domain/ports/screening-provider";
import type { ExtractionFailure } from "@/modules/screening/domain/ports/text-extractor";
import type { MatchBand } from "@/modules/screening/domain/match-score";

const BAND_LABEL: Record<MatchBand, string> = {
  LOW: "Low fit",
  MEDIUM: "Moderate fit",
  HIGH: "Strong fit",
};

export function formatScreeningResult(r: ScreeningResult): string {
  const lines = [
    `**${BAND_LABEL[r.score.band]} — ${r.score.value}/100**`,
    "",
    r.summary,
  ];
  if (r.strengths.length > 0) {
    lines.push("", "**Strengths:**", ...r.strengths.map((s) => `- ${s}`));
  }
  if (r.gaps.length > 0) {
    lines.push("", "**Gaps:**", ...r.gaps.map((g) => `- ${g}`));
  }
  lines.push("", `**Recommendation:** ${r.recommendation}`);
  return lines.join("\n");
}

export function formatProviderError(e: ScreeningProviderError): string {
  switch (e.kind) {
    case "RATE_LIMITED":
      return "The LLM rate-limited the request. Please try again in a moment. Returning to the main menu.";
    case "UNAVAILABLE":
      return "The LLM is currently unreachable. Please try again later. Returning to the main menu.";
    case "MALFORMED_RESPONSE":
      return "The LLM returned an unexpected response shape. Returning to the main menu.";
    case "AUTH_FAILED":
      return "LLM authentication failed — check the API key. Returning to the main menu.";
    case "UNKNOWN":
      return "Something went wrong analyzing the candidate. Returning to the main menu.";
  }
}

export function formatExtractionFailure(f: ExtractionFailure): string {
  switch (f.kind) {
    case "EMPTY":
      return "I couldn't read any text from that file — it may be empty. Paste the text directly or try a different file.";
    case "UNREADABLE":
      return "I couldn't read that file — it may be scanned or password-protected. Paste the text directly or try a different file.";
    case "TOO_LARGE":
      return `That file is too large (${Math.round(f.sizeBytes / 1024)} KB, limit ${Math.round(f.maxBytes / 1024)} KB). Paste the text directly or try a smaller file.`;
    case "UNSUPPORTED_MIME":
      return `I can't read files of type ${f.mime}. Paste the text directly or upload a PDF.`;
  }
}

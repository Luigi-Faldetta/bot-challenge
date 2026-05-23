// Unit test — mocks the Anthropic SDK so no network calls happen here.
// Asserts on the request shape (model, system blocks, cache_control, tools)
// and on the error mapping for every ScreeningProviderError kind.

import { isOk, isErr } from "@/shared/domain/result";

const createMock = jest.fn();

// Mock the SDK module before importing the provider — Jest hoists this.
jest.mock("@anthropic-ai/sdk", () => {
  // Re-export APIError and its subclasses so the real `instanceof APIError`
  // checks in the provider still work against our fakes. We construct fakes
  // that extend the real classes.
  const actual = jest.requireActual("@anthropic-ai/sdk");
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: createMock },
    })),
    APIError: actual.APIError,
    APIConnectionTimeoutError: actual.APIConnectionTimeoutError,
  };
});

import { AnthropicScreeningProvider } from "@/modules/screening/infrastructure/anthropic-screening-provider";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { APIError, APIConnectionTimeoutError } = require("@anthropic-ai/sdk");

const happyResponse = {
  content: [
    {
      type: "tool_use",
      id: "tu_1",
      name: "submit_screening_report",
      input: {
        score: 82,
        summary: "Strong fit on backend + Postgres + AWS.",
        strengths: ["NestJS experience", "Event-driven AWS work"],
        gaps: ["No B2B SaaS mention"],
        recommendation: "Recommend phone screen.",
      },
    },
  ],
};

beforeEach(() => {
  createMock.mockReset();
});

describe("AnthropicScreeningProvider — happy path", () => {
  it("returns the structured analysis on a well-formed response", async () => {
    createMock.mockResolvedValueOnce(happyResponse);
    const provider = new AnthropicScreeningProvider({ apiKey: "sk-ant-test" });

    const out = await provider.run({
      jobDescription: "Senior Backend Engineer at Acme.",
      candidateCv: "6 years TypeScript + NestJS...",
    });

    expect(isOk(out)).toBe(true);
    if (!isOk(out)) return;
    expect(out.value.score.value).toBe(82);
    expect(out.value.strengths).toEqual([
      "NestJS experience",
      "Event-driven AWS work",
    ]);
    expect(out.value.recommendation).toBe("Recommend phone screen.");
  });

  it("requests cache_control on system prompt + JD blocks", async () => {
    createMock.mockResolvedValueOnce(happyResponse);
    const provider = new AnthropicScreeningProvider({ apiKey: "sk-ant-test" });

    await provider.run({ jobDescription: "the JD", candidateCv: "the CV" });

    const call = createMock.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call.system).toHaveLength(2);
    expect(call.system[0]).toMatchObject({
      type: "text",
      cache_control: { type: "ephemeral" },
    });
    expect(call.system[1]).toMatchObject({
      type: "text",
      cache_control: { type: "ephemeral" },
    });
    expect(call.system[1].text).toContain("the JD");
    // CV stays in the messages array (per-call content, not cached).
    expect(call.messages[0].content).toContain("the CV");
  });

  it("forces tool_choice to submit_screening_report", async () => {
    createMock.mockResolvedValueOnce(happyResponse);
    const provider = new AnthropicScreeningProvider({ apiKey: "sk-ant-test" });
    await provider.run({ jobDescription: "x", candidateCv: "y" });

    const call = createMock.mock.calls[0]?.[0];
    expect(call.tool_choice).toEqual({
      type: "tool",
      name: "submit_screening_report",
    });
  });
});

describe("AnthropicScreeningProvider — error mapping", () => {
  it("missing API key → AUTH_FAILED without any network call", async () => {
    const provider = new AnthropicScreeningProvider({ apiKey: undefined });
    const out = await provider.run({ jobDescription: "x", candidateCv: "y" });
    expect(isErr(out)).toBe(true);
    if (!isErr(out)) return;
    expect(out.error.kind).toBe("AUTH_FAILED");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("APIError 429 → RATE_LIMITED", async () => {
    const e = new APIError(429, { error: { message: "Too many" } }, "Too many", new Headers());
    createMock.mockRejectedValueOnce(e);
    const provider = new AnthropicScreeningProvider({ apiKey: "sk-ant-test" });
    const out = await provider.run({ jobDescription: "x", candidateCv: "y" });
    if (!isErr(out)) throw new Error();
    expect(out.error.kind).toBe("RATE_LIMITED");
  });

  it("APIError 503 → UNAVAILABLE", async () => {
    const e = new APIError(503, { error: { message: "Down" } }, "Down", new Headers());
    createMock.mockRejectedValueOnce(e);
    const provider = new AnthropicScreeningProvider({ apiKey: "sk-ant-test" });
    const out = await provider.run({ jobDescription: "x", candidateCv: "y" });
    if (!isErr(out)) throw new Error();
    expect(out.error.kind).toBe("UNAVAILABLE");
  });

  it("APIConnectionTimeoutError (no status) → UNAVAILABLE", async () => {
    // Timeouts extend APIError but have status === undefined. Should bucket
    // with 5xx as UNAVAILABLE so the user sees "unreachable, try again"
    // rather than the generic UNKNOWN copy.
    const e = new APIConnectionTimeoutError({ message: "Request timed out." });
    createMock.mockRejectedValueOnce(e);
    const provider = new AnthropicScreeningProvider({ apiKey: "sk-ant-test" });
    const out = await provider.run({ jobDescription: "x", candidateCv: "y" });
    if (!isErr(out)) throw new Error();
    expect(out.error.kind).toBe("UNAVAILABLE");
  });

  it("APIError 401 → AUTH_FAILED", async () => {
    const e = new APIError(401, { error: { message: "bad key" } }, "bad key", new Headers());
    createMock.mockRejectedValueOnce(e);
    const provider = new AnthropicScreeningProvider({ apiKey: "sk-ant-test" });
    const out = await provider.run({ jobDescription: "x", candidateCv: "y" });
    if (!isErr(out)) throw new Error();
    expect(out.error.kind).toBe("AUTH_FAILED");
  });

  it("response with no tool_use block → MALFORMED_RESPONSE", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "I refuse" }],
    });
    const provider = new AnthropicScreeningProvider({ apiKey: "sk-ant-test" });
    const out = await provider.run({ jobDescription: "x", candidateCv: "y" });
    if (!isErr(out)) throw new Error();
    expect(out.error.kind).toBe("MALFORMED_RESPONSE");
  });

  it("tool_use with missing fields → MALFORMED_RESPONSE", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "tu_1",
          name: "submit_screening_report",
          input: { score: 80 }, // missing summary, strengths, gaps, recommendation
        },
      ],
    });
    const provider = new AnthropicScreeningProvider({ apiKey: "sk-ant-test" });
    const out = await provider.run({ jobDescription: "x", candidateCv: "y" });
    if (!isErr(out)) throw new Error();
    expect(out.error.kind).toBe("MALFORMED_RESPONSE");
  });

  it("non-API error (network/unknown) → UNKNOWN", async () => {
    createMock.mockRejectedValueOnce(new Error("ENETUNREACH"));
    const provider = new AnthropicScreeningProvider({ apiKey: "sk-ant-test" });
    const out = await provider.run({ jobDescription: "x", candidateCv: "y" });
    if (!isErr(out)) throw new Error();
    expect(out.error.kind).toBe("UNKNOWN");
  });
});

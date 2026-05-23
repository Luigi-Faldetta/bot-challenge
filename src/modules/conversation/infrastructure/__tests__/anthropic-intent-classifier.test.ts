import { isOk, isErr } from "@/shared/domain/result";

const createMock = jest.fn();

jest.mock("@anthropic-ai/sdk", () => {
  const actual = jest.requireActual("@anthropic-ai/sdk");
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: { create: createMock },
    })),
    APIError: actual.APIError,
  };
});

import { AnthropicIntentClassifier } from "@/modules/conversation/infrastructure/anthropic-intent-classifier";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { APIError } = require("@anthropic-ai/sdk");

const toolResponse = (intent: string) => ({
  content: [
    {
      type: "tool_use",
      id: "tu_1",
      name: "classify_intent",
      input: { intent },
    },
  ],
});

beforeEach(() => {
  createMock.mockReset();
});

describe("AnthropicIntentClassifier — happy paths", () => {
  it.each([
    ["I'd like to screen a CV", "screen"],
    ["create a new job description", "newjob"],
    ["nevermind, go back", "cancel"],
    ["hello there", "none"],
  ] as const)("classifies '%s' as %s", async (text, intent) => {
    createMock.mockResolvedValueOnce(toolResponse(intent));
    const classifier = new AnthropicIntentClassifier({ apiKey: "sk-ant-test" });
    const result = await classifier.classify(text);
    if (!isOk(result)) throw new Error("expected ok");
    expect(result.value).toBe(intent);
  });

  it("sends cache_control on the system prompt (prompt caching)", async () => {
    createMock.mockResolvedValueOnce(toolResponse("none"));
    const classifier = new AnthropicIntentClassifier({ apiKey: "sk-ant-test" });
    await classifier.classify("hi");

    const call = createMock.mock.calls[0]?.[0];
    expect(call.system[0]).toMatchObject({
      type: "text",
      cache_control: { type: "ephemeral" },
    });
  });

  it("forces tool_choice to classify_intent", async () => {
    createMock.mockResolvedValueOnce(toolResponse("none"));
    const classifier = new AnthropicIntentClassifier({ apiKey: "sk-ant-test" });
    await classifier.classify("hi");

    const call = createMock.mock.calls[0]?.[0];
    expect(call.tool_choice).toEqual({ type: "tool", name: "classify_intent" });
  });

  it("uses Haiku 4.5 by default", async () => {
    createMock.mockResolvedValueOnce(toolResponse("none"));
    const classifier = new AnthropicIntentClassifier({ apiKey: "sk-ant-test" });
    await classifier.classify("hi");

    const call = createMock.mock.calls[0]?.[0];
    expect(call.model).toBe("claude-haiku-4-5-20251001");
  });
});

describe("AnthropicIntentClassifier — error mapping", () => {
  it("missing API key → AUTH_FAILED with no network call", async () => {
    const classifier = new AnthropicIntentClassifier({ apiKey: undefined });
    const result = await classifier.classify("hi");
    if (!isErr(result)) throw new Error();
    expect(result.error.kind).toBe("AUTH_FAILED");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("APIError 429 → RATE_LIMITED", async () => {
    createMock.mockRejectedValueOnce(
      new APIError(429, { error: { message: "rate" } }, "rate", new Headers()),
    );
    const classifier = new AnthropicIntentClassifier({ apiKey: "sk-ant-test" });
    const result = await classifier.classify("hi");
    if (!isErr(result)) throw new Error();
    expect(result.error.kind).toBe("RATE_LIMITED");
  });

  it("APIError 503 → UNAVAILABLE", async () => {
    createMock.mockRejectedValueOnce(
      new APIError(503, { error: { message: "down" } }, "down", new Headers()),
    );
    const classifier = new AnthropicIntentClassifier({ apiKey: "sk-ant-test" });
    const result = await classifier.classify("hi");
    if (!isErr(result)) throw new Error();
    expect(result.error.kind).toBe("UNAVAILABLE");
  });

  it("APIError 401 → AUTH_FAILED", async () => {
    createMock.mockRejectedValueOnce(
      new APIError(401, { error: { message: "bad" } }, "bad", new Headers()),
    );
    const classifier = new AnthropicIntentClassifier({ apiKey: "sk-ant-test" });
    const result = await classifier.classify("hi");
    if (!isErr(result)) throw new Error();
    expect(result.error.kind).toBe("AUTH_FAILED");
  });

  it("response with no tool_use block → MALFORMED_RESPONSE", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "I refuse to classify" }],
    });
    const classifier = new AnthropicIntentClassifier({ apiKey: "sk-ant-test" });
    const result = await classifier.classify("hi");
    if (!isErr(result)) throw new Error();
    expect(result.error.kind).toBe("MALFORMED_RESPONSE");
  });

  it("tool_use with bad intent string → MALFORMED_RESPONSE", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "tu_1",
          name: "classify_intent",
          input: { intent: "not-a-real-intent" },
        },
      ],
    });
    const classifier = new AnthropicIntentClassifier({ apiKey: "sk-ant-test" });
    const result = await classifier.classify("hi");
    if (!isErr(result)) throw new Error();
    expect(result.error.kind).toBe("MALFORMED_RESPONSE");
  });

  it("non-API error (network) → UNKNOWN", async () => {
    createMock.mockRejectedValueOnce(new Error("ENETUNREACH"));
    const classifier = new AnthropicIntentClassifier({ apiKey: "sk-ant-test" });
    const result = await classifier.classify("hi");
    if (!isErr(result)) throw new Error();
    expect(result.error.kind).toBe("UNKNOWN");
  });
});

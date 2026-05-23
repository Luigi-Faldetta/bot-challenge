import {
  HandleUserMessage,
  parseSlashCommand,
  mapIntentToEvent,
  deriveReply,
} from "@/modules/conversation/application/handle-user-message";
import {
  Conversation,
  ConversationId,
} from "@/modules/conversation/domain/conversation";
import type { ConversationRepository } from "@/modules/conversation/domain/ports/conversation-repository";
import type {
  IntentClassifier,
  Intent,
} from "@/modules/conversation/domain/ports/intent-classifier";
import { RunScreening } from "@/modules/screening/application/run-screening";
import { MatchScore } from "@/modules/screening/domain/match-score";
import { ok, err, isOk, type Result } from "@/shared/domain/result";
import type { ScreeningProvider } from "@/modules/screening/domain/ports/screening-provider";
import type { ScreeningRepository } from "@/modules/screening/domain/ports/screening-repository";
import type { IntentClassifierError } from "@/modules/conversation/domain/ports/intent-classifier";

const conversationId = ConversationId("conv-test");

/** Build a use case wired to in-memory fakes. */
function build(opts: {
  initialConversation?: Conversation;
  providerResult?: Awaited<ReturnType<ScreeningProvider["run"]>>;
  classifierResult?: Result<Intent, IntentClassifierError>;
} = {}) {
  const store = new Map<string, Conversation>();
  if (opts.initialConversation) {
    store.set(opts.initialConversation.id, opts.initialConversation);
  }
  const conversations: ConversationRepository = {
    findById: jest.fn(async (id) => store.get(id) ?? null),
    save: jest.fn(async (c) => {
      store.set(c.id, c);
    }),
  };

  const score = MatchScore.create(82);
  if (!isOk(score)) throw new Error();
  const provider: ScreeningProvider = {
    run: jest.fn(async () =>
      opts.providerResult ??
      ok({
        score: score.value,
        summary: "Solid match.",
        strengths: ["NestJS", "Postgres"],
        gaps: ["No SaaS"],
        recommendation: "Interview.",
      }),
    ),
  };
  const screeningRepo: ScreeningRepository = {
    save: jest.fn(async () => {}),
    findById: jest.fn(async () => null),
    findByConversationId: jest.fn(async () => []),
  };

  let idCounter = 0;
  const now = () => new Date("2026-05-21T12:00:00Z");
  const newId = () => `id-${++idCounter}`;

  const runScreening = new RunScreening({
    provider,
    repository: screeningRepo,
    now,
    newId,
  });

  // Default classifier returns "none" so free-text input is treated as
  // content. Individual tests override via `classifierResult`.
  const intentClassifier: IntentClassifier = {
    classify: jest.fn(async () => opts.classifierResult ?? ok<Intent>("none")),
  };

  const useCase = new HandleUserMessage({
    conversations,
    runScreening,
    intentClassifier,
    now,
    newId,
  });

  return { useCase, conversations, provider, store, intentClassifier };
}

describe("HandleUserMessage — entry from IDLE", () => {
  it("/screen → AWAITING_JD with the JD prompt", async () => {
    const { useCase } = build();
    const out = await useCase.execute({ conversationId, text: "/screen" });
    expect(out.state).toEqual({ kind: "SCREENING", step: "AWAITING_JD" });
    expect(out.reply).toMatch(/paste the job description/i);
  });

  it("free text in IDLE → stays IDLE with the greeting", async () => {
    const { useCase } = build();
    const out = await useCase.execute({ conversationId, text: "hello there" });
    expect(out.state).toEqual({ kind: "IDLE" });
    expect(out.reply).toMatch(/i'm here to help/i);
  });

  it("natural-language 'I'd like to screen a candidate' → SCREENING (via classifier)", async () => {
    const { useCase } = build({ classifierResult: ok<Intent>("screen") });
    const out = await useCase.execute({
      conversationId,
      text: "I'd like to screen a candidate against a job description",
    });
    expect(out.state.kind).toBe("SCREENING");
  });

  it("natural-language 'help me draft a job' → JOB_BUILDER (via classifier)", async () => {
    const { useCase } = build({ classifierResult: ok<Intent>("newjob") });
    const out = await useCase.execute({
      conversationId,
      text: "help me draft a senior backend role",
    });
    expect(out.state).toEqual({ kind: "JOB_BUILDER" });
    expect(out.reply).toMatch(/sample JD/i);
  });
});

describe("HandleUserMessage — intent classification", () => {
  it("slash command takes precedence: classifier is NOT called for /screen", async () => {
    const { useCase, intentClassifier } = build();
    await useCase.execute({ conversationId, text: "/screen" });
    expect(intentClassifier.classify).not.toHaveBeenCalled();
  });

  it("natural-language 'cancel' is honored from any state", async () => {
    const initial = Conversation.create(conversationId).apply({
      type: "COMMAND",
      command: "screen",
    });
    const { useCase } = build({
      initialConversation: initial,
      classifierResult: ok<Intent>("cancel"),
    });
    const out = await useCase.execute({
      conversationId,
      text: "nevermind, go back",
    });
    expect(out.state).toEqual({ kind: "IDLE" });
    expect(out.reply).toMatch(/cancelled/i);
  });

  it("classifier 'screen' intent in AWAITING_JD is DEMOTED to USER_MESSAGE (JD content wins)", async () => {
    const initial = Conversation.create(conversationId).apply({
      type: "COMMAND",
      command: "screen",
    });
    const { useCase } = build({
      initialConversation: initial,
      classifierResult: ok<Intent>("screen"),
    });
    const text = "Senior recruiter — responsible for screening candidates...";
    const out = await useCase.execute({ conversationId, text });
    // Stayed in screening, advanced to AWAITING_CV with the text captured as JD.
    expect(out.state).toEqual({
      kind: "SCREENING",
      step: "AWAITING_CV",
      jd: text,
    });
  });

  it("classifier failure → falls back to USER_MESSAGE, no crash", async () => {
    const { useCase } = build({
      classifierResult: err({ kind: "UNAVAILABLE" }),
    });
    const out = await useCase.execute({
      conversationId,
      text: "could you please screen this?",
    });
    // Falls back to USER_MESSAGE: in IDLE, that means we stay in IDLE.
    expect(out.state).toEqual({ kind: "IDLE" });
    expect(out.reply).toMatch(/i'm here to help/i);
  });
});

describe("HandleUserMessage — job-builder flow", () => {
  const buildInBuilder = () => {
    const initial = Conversation.create(conversationId).apply({
      type: "COMMAND",
      command: "newjob",
    });
    return build({ initialConversation: initial });
  };

  it("/newjob from IDLE → JOB_BUILDER with entry-reply", async () => {
    const { useCase } = build();
    const out = await useCase.execute({ conversationId, text: "/newjob" });
    expect(out.state).toEqual({ kind: "JOB_BUILDER" });
    expect(out.reply).toMatch(/sample JD/i);
  });

  it("USER_MESSAGE in JOB_BUILDER → IDLE with mocked sample JD ('builder complete')", async () => {
    const { useCase } = buildInBuilder();
    const out = await useCase.execute({
      conversationId,
      text: "I want to hire a senior backend engineer",
    });
    expect(out.state).toEqual({ kind: "IDLE" });
    expect(out.reply).toMatch(/sample job description/i);
    expect(out.reply).toMatch(/mocked output/i);
  });

  it("/cancel in JOB_BUILDER → IDLE with cancel reply", async () => {
    const { useCase } = buildInBuilder();
    const out = await useCase.execute({ conversationId, text: "/cancel" });
    expect(out.state).toEqual({ kind: "IDLE" });
    expect(out.reply).toMatch(/cancelled/i);
  });

  it("/screen in JOB_BUILDER → JOB_BUILDER (no-op, must exit first)", async () => {
    const { useCase } = buildInBuilder();
    const out = await useCase.execute({ conversationId, text: "/screen" });
    expect(out.state).toEqual({ kind: "JOB_BUILDER" });
    expect(out.reply).toMatch(/job builder/i);
  });
});

describe("HandleUserMessage — screening flow", () => {
  it("AWAITING_JD + free text → AWAITING_CV with CV prompt", async () => {
    const initial = Conversation.create(conversationId).apply({
      type: "COMMAND",
      command: "screen",
    });
    const { useCase } = build({ initialConversation: initial });

    const out = await useCase.execute({
      conversationId,
      text: "Senior Backend Engineer at Acme...",
    });

    expect(out.state).toEqual({
      kind: "SCREENING",
      step: "AWAITING_CV",
      jd: "Senior Backend Engineer at Acme...",
    });
    expect(out.reply).toMatch(/candidate's CV/i);
  });

  it("AWAITING_CV + free text → runs screening, returns to IDLE with result", async () => {
    const initial = Conversation.create(conversationId)
      .apply({ type: "COMMAND", command: "screen" })
      .apply({ type: "USER_MESSAGE", text: "the JD" });
    const { useCase, provider } = build({ initialConversation: initial });

    const out = await useCase.execute({
      conversationId,
      text: "the CV — 6 years TS, NestJS, Postgres",
    });

    expect(provider.run).toHaveBeenCalledWith({
      jobDescription: "the JD",
      candidateCv: "the CV — 6 years TS, NestJS, Postgres",
    });
    expect(out.state).toEqual({ kind: "IDLE" });
    expect(out.reply).toMatch(/Strong fit — 82\/100/);
    expect(out.reply).toMatch(/NestJS/);
    // id-1 = user message, id-2 = screening (minted in RunScreening), id-3 = bot reply
    expect(out.screeningId).toBe("id-2");
  });

  it("LLM rate-limit error → bails back to IDLE with friendly message", async () => {
    const initial = Conversation.create(conversationId)
      .apply({ type: "COMMAND", command: "screen" })
      .apply({ type: "USER_MESSAGE", text: "the JD" });
    const { useCase } = build({
      initialConversation: initial,
      providerResult: err({ kind: "RATE_LIMITED" }),
    });

    const out = await useCase.execute({ conversationId, text: "the CV" });
    expect(out.state).toEqual({ kind: "IDLE" });
    expect(out.reply).toMatch(/rate-limited/i);
    expect(out.screeningId).toBeUndefined();
  });

  it("/cancel mid-screening → IDLE", async () => {
    const initial = Conversation.create(conversationId).apply({
      type: "COMMAND",
      command: "screen",
    });
    const { useCase } = build({ initialConversation: initial });

    const out = await useCase.execute({ conversationId, text: "/cancel" });
    expect(out.state).toEqual({ kind: "IDLE" });
    expect(out.reply).toMatch(/cancelled/i);
  });
});

describe("HandleUserMessage — persistence + history", () => {
  it("persists exactly one conversation per call with appended messages", async () => {
    const { useCase, conversations, store } = build();
    await useCase.execute({ conversationId, text: "/screen" });

    expect(conversations.save).toHaveBeenCalledTimes(1);
    const saved = store.get(conversationId);
    expect(saved).toBeDefined();
    expect(saved!.messages).toHaveLength(2);
    expect(saved!.messages[0]).toMatchObject({ role: "user", text: "/screen" });
    expect(saved!.messages[1]?.role).toBe("assistant");
  });

  it("a brand-new conversation is created on first message", async () => {
    const { useCase, conversations } = build();
    await useCase.execute({ conversationId, text: "hi" });

    expect(conversations.findById).toHaveBeenCalledWith(conversationId);
    expect(conversations.save).toHaveBeenCalledTimes(1);
  });
});

describe("parseSlashCommand (pure helper)", () => {
  it.each([
    ["/screen", { type: "COMMAND", command: "screen" }],
    [" /screen ", { type: "COMMAND", command: "screen" }],
    ["/SCREEN", { type: "COMMAND", command: "screen" }],
    ["/newjob", { type: "COMMAND", command: "newjob" }],
    ["/cancel", { type: "COMMAND", command: "cancel" }],
  ])("'%s' → %j", (input, expected) => {
    expect(parseSlashCommand(input)).toEqual(expected);
  });

  it("free text → null (caller should classify via LLM)", () => {
    expect(parseSlashCommand("just some content")).toBeNull();
  });

  it("natural-language phrasings → null (no longer pattern-matched here)", () => {
    expect(parseSlashCommand("screen a candidate")).toBeNull();
    expect(parseSlashCommand("create a job")).toBeNull();
  });

  it("unknown slash command → null", () => {
    expect(parseSlashCommand("/help")).toBeNull();
  });
});

describe("mapIntentToEvent (pure helper)", () => {
  const idle = { kind: "IDLE" } as const;
  const awaitingJd = { kind: "SCREENING", step: "AWAITING_JD" } as const;
  const jobBuilder = { kind: "JOB_BUILDER" } as const;

  it("cancel intent → COMMAND/cancel from any state", () => {
    expect(mapIntentToEvent("cancel", "x", idle)).toEqual({
      type: "COMMAND",
      command: "cancel",
    });
    expect(mapIntentToEvent("cancel", "x", awaitingJd)).toEqual({
      type: "COMMAND",
      command: "cancel",
    });
    expect(mapIntentToEvent("cancel", "x", jobBuilder)).toEqual({
      type: "COMMAND",
      command: "cancel",
    });
  });

  it("screen intent in IDLE → COMMAND/screen", () => {
    expect(mapIntentToEvent("screen", "x", idle)).toEqual({
      type: "COMMAND",
      command: "screen",
    });
  });

  it("newjob intent in IDLE → COMMAND/newjob", () => {
    expect(mapIntentToEvent("newjob", "x", idle)).toEqual({
      type: "COMMAND",
      command: "newjob",
    });
  });

  it("screen intent in AWAITING_JD → USER_MESSAGE (state-aware demotion)", () => {
    expect(mapIntentToEvent("screen", "the JD content", awaitingJd)).toEqual({
      type: "USER_MESSAGE",
      text: "the JD content",
    });
  });

  it("newjob intent in JOB_BUILDER → USER_MESSAGE (already in builder)", () => {
    expect(mapIntentToEvent("newjob", "more text", jobBuilder)).toEqual({
      type: "USER_MESSAGE",
      text: "more text",
    });
  });

  it("none intent → USER_MESSAGE always", () => {
    expect(mapIntentToEvent("none", "hello", idle)).toEqual({
      type: "USER_MESSAGE",
      text: "hello",
    });
  });
});

describe("deriveReply (pure helper)", () => {
  const idle = { kind: "IDLE" } as const;
  const jobBuilder = { kind: "JOB_BUILDER" } as const;

  it("IDLE + /cancel → cancellation acknowledgement", () => {
    expect(
      deriveReply(idle, { type: "COMMAND", command: "cancel" }, idle),
    ).toMatch(/cancelled/i);
  });

  it("AWAITING_JD → ask for the JD", () => {
    expect(
      deriveReply(
        { kind: "SCREENING", step: "AWAITING_JD" },
        { type: "USER_MESSAGE", text: "x" },
        idle,
      ),
    ).toMatch(/job description/i);
  });

  it("AWAITING_CV → ask for the CV", () => {
    expect(
      deriveReply(
        { kind: "SCREENING", step: "AWAITING_CV", jd: "x" },
        { type: "USER_MESSAGE", text: "y" },
        { kind: "SCREENING", step: "AWAITING_JD" },
      ),
    ).toMatch(/CV/);
  });

  it("IDLE → JOB_BUILDER → entry reply", () => {
    expect(
      deriveReply(jobBuilder, { type: "COMMAND", command: "newjob" }, idle),
    ).toMatch(/sample JD/i);
  });

  it("JOB_BUILDER → IDLE via USER_MESSAGE → sample JD output", () => {
    expect(
      deriveReply(idle, { type: "USER_MESSAGE", text: "x" }, jobBuilder),
    ).toMatch(/sample job description/i);
  });

  it("JOB_BUILDER → JOB_BUILDER (no-op) → nudge reply", () => {
    expect(
      deriveReply(
        jobBuilder,
        { type: "COMMAND", command: "screen" },
        jobBuilder,
      ),
    ).toMatch(/job builder/i);
  });
});

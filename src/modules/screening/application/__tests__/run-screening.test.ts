import { RunScreening } from "@/modules/screening/application/run-screening";
import { ConversationId } from "@/modules/conversation/domain/conversation";
import { MatchScore } from "@/modules/screening/domain/match-score";
import {
  type ScreeningResult,
} from "@/modules/screening/domain/screening-result";
import type {
  ScreeningProvider,
  ScreeningProviderError,
} from "@/modules/screening/domain/ports/screening-provider";
import type { ScreeningRepository } from "@/modules/screening/domain/ports/screening-repository";
import { ok, err, isOk, isErr, type Result } from "@/shared/domain/result";

const conversationId = ConversationId("conv-1");

const buildAnalysis = (score = 80) => {
  const s = MatchScore.create(score);
  if (!isOk(s)) throw new Error("bad score in test setup");
  return {
    score: s.value,
    summary: "Strong overlap on backend + Postgres + AWS.",
    strengths: ["NestJS experience", "Event-driven AWS work"],
    gaps: ["No mention of B2B SaaS"],
    recommendation: "Interview recommended.",
  };
};

const buildDeps = (overrides: {
  providerResult?: Result<ReturnType<typeof buildAnalysis>, ScreeningProviderError>;
  savedSpy?: ScreeningResult[];
} = {}) => {
  const provider: ScreeningProvider = {
    run: jest.fn(async () => overrides.providerResult ?? ok(buildAnalysis())),
  };
  const saved: ScreeningResult[] = overrides.savedSpy ?? [];
  const repository: ScreeningRepository = {
    save: jest.fn(async (r) => {
      saved.push(r);
    }),
    findById: jest.fn(async () => null),
    findByConversationId: jest.fn(async () => []),
  };
  let idCounter = 0;
  return {
    provider,
    repository,
    saved,
    now: () => new Date("2026-05-21T12:00:00Z"),
    newId: () => `screening-${++idCounter}`,
  };
};

describe("RunScreening", () => {
  it("persists a ScreeningResult and returns it on provider success", async () => {
    const deps = buildDeps();
    const useCase = new RunScreening(deps);

    const out = await useCase.execute({
      conversationId,
      jobDescription: "Senior Backend Engineer...",
      candidateCv: "6 years TypeScript + NestJS...",
    });

    expect(isOk(out)).toBe(true);
    if (!isOk(out)) return;
    expect(out.value.conversationId).toBe(conversationId);
    expect(out.value.score.value).toBe(80);
    expect(out.value.recommendation).toBe("Interview recommended.");
    expect(out.value.createdAt).toEqual(new Date("2026-05-21T12:00:00Z"));
    expect(deps.saved).toHaveLength(1);
    expect(deps.saved[0]).toBe(out.value);
  });

  it("propagates the provider error verbatim and does NOT persist anything", async () => {
    const deps = buildDeps({
      providerResult: err({ kind: "RATE_LIMITED" }),
    });
    const useCase = new RunScreening(deps);

    const out = await useCase.execute({
      conversationId,
      jobDescription: "x",
      candidateCv: "y",
    });

    expect(isErr(out)).toBe(true);
    if (!isErr(out)) return;
    expect(out.error).toEqual({ kind: "RATE_LIMITED" });
    expect(deps.saved).toHaveLength(0);
    expect(deps.repository.save).not.toHaveBeenCalled();
  });

  it("uses the injected clock + id generator (deterministic)", async () => {
    const deps = buildDeps();
    const useCase = new RunScreening(deps);

    const out = await useCase.execute({
      conversationId,
      jobDescription: "x",
      candidateCv: "y",
    });
    if (!isOk(out)) throw new Error();
    expect(out.value.id).toBe("screening-1");
    expect(out.value.createdAt).toEqual(new Date("2026-05-21T12:00:00Z"));
  });
});

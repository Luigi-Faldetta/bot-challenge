// RunScreening use case — calls the LLM provider with a JD + CV, persists the
// resulting ScreeningResult, returns either the saved aggregate or the typed
// provider error so the caller (HandleUserMessage) can map it to a bot reply.
//
// Deliberately small and dependency-injected: no Date.now() or crypto direct
// imports here, so tests are fully deterministic.

import { type Result, ok, err } from "@/shared/domain/result";
import type { ConversationId } from "@/modules/conversation/domain/conversation";
import {
  ScreeningResult,
  ScreeningId,
} from "@/modules/screening/domain/screening-result";
import type {
  ScreeningProvider,
  ScreeningProviderError,
} from "@/modules/screening/domain/ports/screening-provider";
import type { ScreeningRepository } from "@/modules/screening/domain/ports/screening-repository";

export type RunScreeningInput = {
  conversationId: ConversationId;
  jobDescription: string;
  candidateCv: string;
};

export type RunScreeningDeps = {
  provider: ScreeningProvider;
  repository: ScreeningRepository;
  now: () => Date;
  newId: () => string;
};

export class RunScreening {
  constructor(private readonly deps: RunScreeningDeps) {}

  async execute(
    input: RunScreeningInput,
  ): Promise<Result<ScreeningResult, ScreeningProviderError>> {
    const analysis = await this.deps.provider.run({
      jobDescription: input.jobDescription,
      candidateCv: input.candidateCv,
    });
    if (!analysis.ok) return err(analysis.error);

    const result = ScreeningResult.create({
      id: ScreeningId(this.deps.newId()),
      conversationId: input.conversationId,
      analysis: analysis.value,
      createdAt: this.deps.now(),
    });
    await this.deps.repository.save(result);
    return ok(result);
  }
}

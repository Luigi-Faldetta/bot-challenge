// ScreeningResult — the aggregate persisted after a successful LLM run.
//
// Each ScreeningResult is owned by exactly one Conversation (the one that
// triggered it); the FK lives here, not on Conversation. We don't model
// multiple screenings per conversation in scope, but the schema permits it
// so adding "/rescreen" later is cheap.

import { Entity } from "@/shared/domain/entity";
import type { ConversationId } from "@/modules/conversation/domain/conversation";
import type { MatchScore } from "./match-score";

export type ScreeningId = string & { readonly __brand: "ScreeningId" };

export const ScreeningId = (raw: string): ScreeningId => raw as ScreeningId;

/** The pure "what the LLM said" payload — id/conversationId/createdAt are added by the aggregate. */
export type ScreeningAnalysis = {
  readonly score: MatchScore;
  readonly summary: string;
  readonly strengths: readonly string[];
  readonly gaps: readonly string[];
  readonly recommendation: string;
};

export class ScreeningResult extends Entity<ScreeningId> {
  private constructor(
    id: ScreeningId,
    public readonly conversationId: ConversationId,
    public readonly score: MatchScore,
    public readonly summary: string,
    public readonly strengths: readonly string[],
    public readonly gaps: readonly string[],
    public readonly recommendation: string,
    public readonly createdAt: Date,
  ) {
    super(id);
  }

  static create(args: {
    id: ScreeningId;
    conversationId: ConversationId;
    analysis: ScreeningAnalysis;
    createdAt: Date;
  }): ScreeningResult {
    return new ScreeningResult(
      args.id,
      args.conversationId,
      args.analysis.score,
      args.analysis.summary,
      args.analysis.strengths,
      args.analysis.gaps,
      args.analysis.recommendation,
      args.createdAt,
    );
  }

  /** Reconstruct from a persisted row. */
  static rebuild(args: {
    id: ScreeningId;
    conversationId: ConversationId;
    score: MatchScore;
    summary: string;
    strengths: readonly string[];
    gaps: readonly string[];
    recommendation: string;
    createdAt: Date;
  }): ScreeningResult {
    return new ScreeningResult(
      args.id,
      args.conversationId,
      args.score,
      args.summary,
      args.strengths,
      args.gaps,
      args.recommendation,
      args.createdAt,
    );
  }
}

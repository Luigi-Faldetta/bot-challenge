// Drizzle adapter implementing ScreeningRepository.

import { asc, eq } from "drizzle-orm";
import type { Db } from "@/shared/infrastructure/db/client";
import { screenings as screeningsTable } from "@/shared/infrastructure/db/schema";
import type { ScreeningRepository } from "@/modules/screening/domain/ports/screening-repository";
import {
  ScreeningResult,
  ScreeningId,
} from "@/modules/screening/domain/screening-result";
import { MatchScore } from "@/modules/screening/domain/match-score";
import { ConversationId } from "@/modules/conversation/domain/conversation";

export class PostgresScreeningRepository implements ScreeningRepository {
  constructor(private readonly db: Db) {}

  async save(result: ScreeningResult): Promise<void> {
    await this.db
      .insert(screeningsTable)
      .values({
        id: result.id,
        conversationId: result.conversationId,
        score: result.score.value,
        summary: result.summary,
        strengths: result.strengths,
        gaps: result.gaps,
        recommendation: result.recommendation,
        createdAt: result.createdAt,
      })
      .onConflictDoNothing();
  }

  async findById(id: ScreeningId): Promise<ScreeningResult | null> {
    const [row] = await this.db
      .select()
      .from(screeningsTable)
      .where(eq(screeningsTable.id, id))
      .limit(1);

    return row ? this.toAggregate(row) : null;
  }

  async findByConversationId(
    id: ConversationId,
  ): Promise<readonly ScreeningResult[]> {
    const rows = await this.db
      .select()
      .from(screeningsTable)
      .where(eq(screeningsTable.conversationId, id))
      .orderBy(asc(screeningsTable.createdAt));

    return rows.map((r) => this.toAggregate(r));
  }

  private toAggregate(row: {
    id: string;
    conversationId: string;
    score: number;
    summary: string;
    strengths: readonly string[];
    gaps: readonly string[];
    recommendation: string;
    createdAt: Date;
  }): ScreeningResult {
    return ScreeningResult.rebuild({
      id: ScreeningId(row.id),
      conversationId: ConversationId(row.conversationId),
      score: MatchScore.fromTrusted(row.score),
      summary: row.summary,
      strengths: row.strengths,
      gaps: row.gaps,
      recommendation: row.recommendation,
      createdAt: row.createdAt,
    });
  }
}

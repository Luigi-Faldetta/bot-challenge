// Integration test — ScreeningResult persistence + retrieval against real
// Postgres. Each test seeds its own conversation row (FK requirement) and
// truncates between runs.

import { sql } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db/client";
import { PostgresConversationRepository } from "@/modules/conversation/infrastructure/postgres-conversation-repository";
import { PostgresScreeningRepository } from "@/modules/screening/infrastructure/postgres-screening-repository";
import {
  Conversation,
  ConversationId,
} from "@/modules/conversation/domain/conversation";
import {
  ScreeningResult,
  ScreeningId,
} from "@/modules/screening/domain/screening-result";
import { MatchScore } from "@/modules/screening/domain/match-score";
import { isOk } from "@/shared/domain/result";

const conversations = new PostgresConversationRepository(db);
const screenings = new PostgresScreeningRepository(db);

async function seedConversation(): Promise<ConversationId> {
  const id = ConversationId(crypto.randomUUID());
  await conversations.save(Conversation.create(id));
  return id;
}

function buildResult(
  conversationId: ConversationId,
  overrides: { id?: string; score?: number; createdAt?: Date } = {},
): ScreeningResult {
  const score = MatchScore.create(overrides.score ?? 82);
  if (!isOk(score)) throw new Error("bad score in test setup");
  return ScreeningResult.create({
    id: ScreeningId(overrides.id ?? crypto.randomUUID()),
    conversationId,
    createdAt: overrides.createdAt ?? new Date("2026-05-21T12:00:00Z"),
    analysis: {
      score: score.value,
      summary: "Strong fit on backend + Postgres + AWS.",
      strengths: ["NestJS experience", "Event-driven AWS work"],
      gaps: ["No B2B SaaS mention"],
      recommendation: "Recommend phone screen.",
    },
  });
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE conversations CASCADE`);
});

describe("PostgresScreeningRepository (integration)", () => {
  it("returns null when no screening exists for the id", async () => {
    const result = await screenings.findById(ScreeningId(crypto.randomUUID()));
    expect(result).toBeNull();
  });

  it("save() → findById() round-trips the full aggregate", async () => {
    const convId = await seedConversation();
    const original = buildResult(convId);
    await screenings.save(original);

    const found = await screenings.findById(original.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(original.id);
    expect(found!.conversationId).toBe(convId);
    expect(found!.score.value).toBe(82);
    expect(found!.score.band).toBe("HIGH");
    expect(found!.summary).toBe(original.summary);
    expect(found!.strengths).toEqual(original.strengths);
    expect(found!.gaps).toEqual(original.gaps);
    expect(found!.recommendation).toBe(original.recommendation);
    expect(found!.createdAt.toISOString()).toBe(original.createdAt.toISOString());
  });

  it("findByConversationId() returns all results ordered by createdAt", async () => {
    const convId = await seedConversation();
    const t0 = new Date("2026-05-21T12:00:00Z");
    const t1 = new Date("2026-05-21T12:01:00Z");
    const t2 = new Date("2026-05-21T12:02:00Z");

    // Save in reverse chronological order to verify ORDER BY.
    await screenings.save(buildResult(convId, { id: "c", createdAt: t2, score: 95 }));
    await screenings.save(buildResult(convId, { id: "a", createdAt: t0, score: 50 }));
    await screenings.save(buildResult(convId, { id: "b", createdAt: t1, score: 70 }));

    const results = await screenings.findByConversationId(convId);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(results.map((r) => r.score.value)).toEqual([50, 70, 95]);
  });

  it("save() is idempotent — saving the same row twice does NOT throw or duplicate", async () => {
    const convId = await seedConversation();
    const r = buildResult(convId);
    await screenings.save(r);
    await screenings.save(r); // ON CONFLICT DO NOTHING

    const all = await screenings.findByConversationId(convId);
    expect(all).toHaveLength(1);
  });

  it("conversations and screenings are isolated by conversation_id", async () => {
    const convA = await seedConversation();
    const convB = await seedConversation();
    await screenings.save(buildResult(convA, { id: "for-a" }));
    await screenings.save(buildResult(convB, { id: "for-b" }));

    expect((await screenings.findByConversationId(convA)).map((r) => r.id)).toEqual(["for-a"]);
    expect((await screenings.findByConversationId(convB)).map((r) => r.id)).toEqual(["for-b"]);
  });
});

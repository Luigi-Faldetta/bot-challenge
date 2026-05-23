// Integration test — exercises the Drizzle repository against the real
// Postgres in docker-compose. Verifies round-trip persistence: a Conversation
// constructed in memory, saved, then refound is structurally identical.
//
// Prerequisite: `docker compose up -d postgres` and `npm run db:push`.
// Run with `npm run test:int`.

import { sql } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db/client";
import { PostgresConversationRepository } from "@/modules/conversation/infrastructure/postgres-conversation-repository";
import {
  Conversation,
  ConversationId,
  type ChatMessage,
} from "@/modules/conversation/domain/conversation";

const repo = new PostgresConversationRepository(db);

beforeEach(async () => {
  // CASCADE clears chat_messages + screenings too via FK.
  await db.execute(sql`TRUNCATE conversations CASCADE`);
});

afterAll(async () => {
  // postgres-js doesn't expose .end() through Drizzle directly; the
  // connection pool will close when the process exits.
});

const msg = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "user",
  text: "hello",
  createdAt: new Date("2026-05-21T10:00:00Z"),
  ...overrides,
});

describe("PostgresConversationRepository (integration)", () => {
  it("returns null when no conversation exists for the id", async () => {
    const result = await repo.findById(ConversationId(crypto.randomUUID()));
    expect(result).toBeNull();
  });

  it("save() inserts a brand-new conversation that findById() can re-read", async () => {
    const id = ConversationId(crypto.randomUUID());
    const conv = Conversation.create(id)
      .apply({ type: "COMMAND", command: "screen" })
      .appendMessage(msg({ id: "m-1", role: "user", text: "/screen" }))
      .appendMessage(
        msg({
          id: "m-2",
          role: "assistant",
          text: "Sure — paste the JD.",
          createdAt: new Date("2026-05-21T10:00:01Z"),
        }),
      );

    await repo.save(conv);

    const found = await repo.findById(id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(id);
    expect(found!.state).toEqual({
      kind: "SCREENING",
      step: "AWAITING_JD",
    });
    expect(found!.messages).toHaveLength(2);
    expect(found!.messages[0]?.text).toBe("/screen");
    expect(found!.messages[1]?.role).toBe("assistant");
  });

  it("save() upserts state on subsequent saves (no duplicate rows)", async () => {
    const id = ConversationId(crypto.randomUUID());
    let conv = Conversation.create(id);
    await repo.save(conv);

    conv = conv.apply({ type: "COMMAND", command: "screen" });
    await repo.save(conv);

    conv = conv.apply({ type: "USER_MESSAGE", text: "the JD" });
    await repo.save(conv);

    const found = await repo.findById(id);
    expect(found!.state).toEqual({
      kind: "SCREENING",
      step: "AWAITING_CV",
      jd: "the JD",
    });
  });

  it("messages are append-only — re-saving with the same ids does NOT duplicate", async () => {
    const id = ConversationId(crypto.randomUUID());
    const first = msg({ id: "stable-1", text: "first" });
    const second = msg({ id: "stable-2", text: "second", role: "assistant" });

    const conv = Conversation.create(id).appendMessage(first).appendMessage(second);
    await repo.save(conv);
    await repo.save(conv); // intentional second save with the same payload

    const found = await repo.findById(id);
    expect(found!.messages).toHaveLength(2);
  });

  it("messages come back ordered by createdAt", async () => {
    const id = ConversationId(crypto.randomUUID());
    const t0 = new Date("2026-05-21T10:00:00Z");
    const t1 = new Date("2026-05-21T10:00:01Z");
    const t2 = new Date("2026-05-21T10:00:02Z");

    // Append in a different order from createdAt to prove ORDER BY works.
    const conv = Conversation.create(id)
      .appendMessage(msg({ id: "b", text: "second", createdAt: t1 }))
      .appendMessage(msg({ id: "a", text: "first", createdAt: t0 }))
      .appendMessage(msg({ id: "c", text: "third", createdAt: t2 }));

    await repo.save(conv);

    const found = await repo.findById(id);
    expect(found!.messages.map((m) => m.text)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
});

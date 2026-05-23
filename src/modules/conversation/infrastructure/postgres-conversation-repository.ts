// Drizzle adapter implementing ConversationRepository.
//
// Domain types stay pure: this file is the ONLY place where domain shapes
// are translated to/from Drizzle column types. Anything imported from
// drizzle-orm stays inside infrastructure.

import { asc, eq } from "drizzle-orm";
import type { Db } from "@/shared/infrastructure/db/client";
import {
  conversations as conversationsTable,
  chatMessages as chatMessagesTable,
} from "@/shared/infrastructure/db/schema";
import type { ConversationRepository } from "@/modules/conversation/domain/ports/conversation-repository";
import {
  Conversation,
  ConversationId,
  type ChatMessage,
  type ChatRole,
} from "@/modules/conversation/domain/conversation";
import type { ConversationState } from "@/modules/conversation/domain/state";

export class PostgresConversationRepository implements ConversationRepository {
  constructor(private readonly db: Db) {}

  async findById(id: ConversationId): Promise<Conversation | null> {
    const [row] = await this.db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .limit(1);

    if (!row) return null;

    const messageRows = await this.db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.conversationId, id))
      .orderBy(asc(chatMessagesTable.createdAt));

    const messages: ChatMessage[] = messageRows.map((m) => ({
      id: m.id,
      role: m.role as ChatRole,
      text: m.text,
      createdAt: m.createdAt,
    }));

    // We trust the DB shape because writes only happen via `save` below,
    // which serialises the same union. Validating here would catch schema
    // drift but adds a Zod parse on every read for no observable benefit
    // in scope.
    return Conversation.rebuild(
      ConversationId(row.id),
      row.state as ConversationState,
      messages,
    );
  }

  async save(conversation: Conversation): Promise<void> {
    const now = new Date();

    await this.db
      .insert(conversationsTable)
      .values({
        id: conversation.id,
        state: conversation.state,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: conversationsTable.id,
        set: {
          state: conversation.state,
          updatedAt: now,
        },
      });

    if (conversation.messages.length > 0) {
      // Messages are append-only; new ids are inserted, existing ids are skipped.
      await this.db
        .insert(chatMessagesTable)
        .values(
          conversation.messages.map((m) => ({
            id: m.id,
            conversationId: conversation.id,
            role: m.role,
            text: m.text,
            createdAt: m.createdAt,
          })),
        )
        .onConflictDoNothing();
    }
  }
}

// Drizzle schema — single source of truth for all tables.
// Domain code never imports from this file; only infrastructure repositories do.
// Apply with `npm run db:push` (uses drizzle-kit push for dev simplicity —
// we don't need a migration history for a take-home).

import {
  pgTable,
  text,
  timestamp,
  jsonb,
  smallint,
  index,
} from "drizzle-orm/pg-core";

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  // ConversationState — discriminated union stored as JSON. Trusted on read;
  // application code validates structure before use.
  state: jsonb("state").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'user' | 'assistant'
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("chat_messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const screenings = pgTable(
  "screenings",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    score: smallint("score").notNull(), // 0..100, enforced by domain
    summary: text("summary").notNull(),
    strengths: jsonb("strengths").notNull().$type<readonly string[]>(),
    gaps: jsonb("gaps").notNull().$type<readonly string[]>(),
    recommendation: text("recommendation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("screenings_conversation_idx").on(t.conversationId, t.createdAt)],
);

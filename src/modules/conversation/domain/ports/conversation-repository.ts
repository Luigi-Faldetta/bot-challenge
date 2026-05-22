// Port — implementations live in `infrastructure/`. Domain code talks to this
// interface only; it never imports concrete repositories. The dependency rule
// is enforced by ESLint in a later commit.
//
// findById returns null on miss (not an Error / Result) because "no row" is
// a normal, expected case the application layer handles by creating a fresh
// Conversation.

import type { Conversation, ConversationId } from "../conversation";

export interface ConversationRepository {
  /** Returns the persisted conversation, or null if no row exists yet. */
  findById(id: ConversationId): Promise<Conversation | null>;

  /** Upsert — creates the row on first save, updates state + messages thereafter. */
  save(conversation: Conversation): Promise<void>;
}

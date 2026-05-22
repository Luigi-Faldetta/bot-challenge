// Conversation aggregate — the persisted root of the conversation context.
//
// Wraps three things:
//   - id (stable identity, used for persistence)
//   - state (the FSM's current position)
//   - messages (ordered chat history for display)
//
// Methods return new instances (immutable). The application layer composes
// `apply(event)` and `appendMessage(msg)` to drive both the FSM and the
// visible history; the repository persists the resulting snapshot.
//
// The aggregate does NOT auto-derive bot replies from events. Reply text is
// the application layer's responsibility (it knows about strings/i18n/etc.);
// the aggregate only knows about state transitions and the message log.

import { Entity } from "@/shared/domain/entity";
import { transition } from "./transitions";
import { idle, type ConversationState } from "./state";
import type { ConversationEvent } from "./events";

/** Branded string id for type safety at module boundaries. */
export type ConversationId = string & { readonly __brand: "ConversationId" };

export const ConversationId = (raw: string): ConversationId =>
  raw as ConversationId;

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  readonly id: string;
  readonly role: ChatRole;
  readonly text: string;
  readonly createdAt: Date;
};

export class Conversation extends Entity<ConversationId> {
  private constructor(
    id: ConversationId,
    public readonly state: ConversationState,
    public readonly messages: readonly ChatMessage[],
  ) {
    super(id);
  }

  /** Factory for a brand-new conversation in the initial state. */
  static create(id: ConversationId): Conversation {
    return new Conversation(id, idle(), []);
  }

  /** Reconstruct from persistence (e.g. a row + its messages). */
  static rebuild(
    id: ConversationId,
    state: ConversationState,
    messages: readonly ChatMessage[],
  ): Conversation {
    return new Conversation(id, state, messages);
  }

  /** Apply an FSM event; returns a new aggregate with the resulting state. */
  apply(event: ConversationEvent): Conversation {
    return new Conversation(
      this.id,
      transition(this.state, event),
      this.messages,
    );
  }

  /** Append a chat message to the history. */
  appendMessage(message: ChatMessage): Conversation {
    return new Conversation(this.id, this.state, [...this.messages, message]);
  }
}

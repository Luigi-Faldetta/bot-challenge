// Primary use case: takes a raw user message, drives the FSM, runs the LLM
// when the FSM lands in PROCESSING, returns the bot reply for the route
// handler to render.
//
// Side effects are limited to two ports: the conversation repository (load +
// save) and the RunScreening sub-use-case (which itself touches the provider
// and screening repository). Time and ids are injected for determinism.
//
// The FSM stays total; this use case never throws on user-input errors —
// they get mapped to friendly bot replies.

import {
  Conversation,
  type ConversationId,
  type ChatMessage,
  type ChatRole,
} from "@/modules/conversation/domain/conversation";
import type { ConversationRepository } from "@/modules/conversation/domain/ports/conversation-repository";
import type {
  IntentClassifier,
  Intent,
} from "@/modules/conversation/domain/ports/intent-classifier";
import type {
  ConversationEvent,
  SlashCommand,
} from "@/modules/conversation/domain/events";
import type { ConversationState } from "@/modules/conversation/domain/state";
import type { RunScreening } from "@/modules/screening/application/run-screening";
import type { ScreeningId } from "@/modules/screening/domain/screening-result";
import {
  formatProviderError,
  formatScreeningResult,
} from "@/modules/screening/application/format-screening-reply";
import { deriveReply } from "@/modules/conversation/application/derive-reply";

export type HandleUserMessageInput = {
  conversationId: ConversationId;
  text: string;
};

export type HandleUserMessageOutput = {
  reply: string;
  state: ConversationState;
  screeningId?: ScreeningId;
};

export type HandleUserMessageDeps = {
  conversations: ConversationRepository;
  runScreening: RunScreening;
  intentClassifier: IntentClassifier;
  now: () => Date;
  newId: () => string;
};

const SLASH_PATTERN = /^\/(screen|newjob|cancel)\s*$/i;

export class HandleUserMessage {
  constructor(private readonly deps: HandleUserMessageDeps) {}

  async execute(
    input: HandleUserMessageInput,
  ): Promise<HandleUserMessageOutput> {
    let conv =
      (await this.deps.conversations.findById(input.conversationId)) ??
      Conversation.create(input.conversationId);

    conv = conv.appendMessage(this.message("user", input.text));

    const prevState = conv.state;
    const event = await this.resolveEvent(input.text, prevState);
    conv = conv.apply(event);

    const { reply, conv: convAfterSideEffects, screeningId } =
      await this.runSideEffects(conv, event, prevState, input.conversationId);
    conv = convAfterSideEffects;

    conv = conv.appendMessage(this.message("assistant", reply));
    await this.deps.conversations.save(conv);

    return { reply, state: conv.state, screeningId };
  }

  /**
   * The only real side effect is the LLM call when the FSM lands in
   * SCREENING/PROCESSING. Everything else — including JOB_BUILDER —
   * is handled by the FSM + deriveReply, no special-casing here.
   */
  private async runSideEffects(
    conv: Conversation,
    event: ConversationEvent,
    prevState: ConversationState,
    conversationId: ConversationId,
  ): Promise<{ reply: string; conv: Conversation; screeningId?: ScreeningId }> {
    if (conv.state.kind === "SCREENING" && conv.state.step === "PROCESSING") {
      const { jd = "", cv = "" } = conv.state;
      const result = await this.deps.runScreening.execute({
        conversationId,
        jobDescription: jd,
        candidateCv: cv,
      });
      if (result.ok) {
        return {
          reply: formatScreeningResult(result.value),
          conv: conv.apply({ type: "SCREENING_COMPLETED" }),
          screeningId: result.value.id,
        };
      }
      // LLM failure: bail back to IDLE so the user can retry cleanly.
      return {
        reply: formatProviderError(result.error),
        conv: conv.apply({ type: "COMMAND", command: "cancel" }),
      };
    }

    return { reply: deriveReply(conv.state, event, prevState), conv };
  }

  /**
   * Two-tier intent resolution: try the slash-command parse first (sync, free,
   * deterministic); if no slash matches, ask the LLM classifier and map the
   * intent to an event with state context. Classifier failures degrade
   * gracefully to USER_MESSAGE — the bot never crashes on classifier outage.
   */
  private async resolveEvent(
    text: string,
    state: ConversationState,
  ): Promise<ConversationEvent> {
    const slash = parseSlashCommand(text);
    if (slash) return slash;

    const result = await this.deps.intentClassifier.classify(text);
    const intent: Intent = result.ok ? result.value : "none";
    return mapIntentToEvent(intent, text, state);
  }

  private message(role: ChatRole, text: string): ChatMessage {
    return {
      id: this.deps.newId(),
      role,
      text,
      createdAt: this.deps.now(),
    };
  }
}

// ─── pure helpers (exported for unit tests) ───────────────────────────────

/**
 * Detects a literal slash command. Sync, free, deterministic — covers the
 * `/screen`, `/newjob`, `/cancel` paths without any LLM call. Returns null
 * when the text isn't a slash command, in which case the use case falls
 * back to the LLM intent classifier.
 */
export function parseSlashCommand(rawText: string): ConversationEvent | null {
  const match = SLASH_PATTERN.exec(rawText.trim());
  if (!match) return null;
  return { type: "COMMAND", command: match[1]!.toLowerCase() as SlashCommand };
}

/**
 * Maps a classifier intent to an FSM event, with state context. State-aware
 * demotion stops a JD that mentions "screening" from accidentally restarting
 * the flow: `screen`/`newjob` only act from IDLE; from any non-IDLE state
 * they're treated as content. `cancel` works from anywhere.
 */
export function mapIntentToEvent(
  intent: Intent,
  rawText: string,
  state: ConversationState,
): ConversationEvent {
  if (intent === "cancel") {
    return { type: "COMMAND", command: "cancel" };
  }
  if (state.kind === "IDLE" && intent === "screen") {
    return { type: "COMMAND", command: "screen" };
  }
  if (state.kind === "IDLE" && intent === "newjob") {
    return { type: "COMMAND", command: "newjob" };
  }
  return { type: "USER_MESSAGE", text: rawText };
}


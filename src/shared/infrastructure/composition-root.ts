// Composition root — the one place where real implementations of every port
// are constructed and wired into use cases. Route handlers import the
// singletons from here; tests bypass this module entirely and instantiate
// use cases with fake adapters.
//
// Module-level singletons are fine for Next.js: route handlers reuse the
// same module instance across requests in a given process.

import { db } from "./db/client";
import { env } from "./env";
import { PostgresConversationRepository } from "@/modules/conversation/infrastructure/postgres-conversation-repository";
import { AnthropicIntentClassifier } from "@/modules/conversation/infrastructure/anthropic-intent-classifier";
import { PostgresScreeningRepository } from "@/modules/screening/infrastructure/postgres-screening-repository";
import { AnthropicScreeningProvider } from "@/modules/screening/infrastructure/anthropic-screening-provider";
import { PdfTextExtractor } from "@/modules/screening/infrastructure/pdf-text-extractor";
import { RunScreening } from "@/modules/screening/application/run-screening";
import { HandleUserMessage } from "@/modules/conversation/application/handle-user-message";

const conversationRepo = new PostgresConversationRepository(db);
const screeningRepo = new PostgresScreeningRepository(db);
const screeningProvider = new AnthropicScreeningProvider({
  apiKey: env().ANTHROPIC_API_KEY,
});
const intentClassifier = new AnthropicIntentClassifier({
  apiKey: env().ANTHROPIC_API_KEY,
});
const textExtractor = new PdfTextExtractor();

const now = () => new Date();
const newId = () => crypto.randomUUID();

const runScreening = new RunScreening({
  provider: screeningProvider,
  repository: screeningRepo,
  now,
  newId,
});

export const handleUserMessage = new HandleUserMessage({
  conversations: conversationRepo,
  runScreening,
  intentClassifier,
  now,
  newId,
});

export { textExtractor };

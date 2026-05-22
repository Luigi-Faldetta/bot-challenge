// Port for persisting ScreeningResult aggregates. Drizzle adapter lives in
// infrastructure; tests use an in-memory fake.

import type { ConversationId } from "@/modules/conversation/domain/conversation";
import type { ScreeningResult, ScreeningId } from "../screening-result";

export interface ScreeningRepository {
  save(result: ScreeningResult): Promise<void>;
  findById(id: ScreeningId): Promise<ScreeningResult | null>;
  findByConversationId(id: ConversationId): Promise<readonly ScreeningResult[]>;
}

// GET /api/health — liveness + dependency check.
//
// Returns the DB and LLM presence status. The LLM check is a presence-only
// gate (we don't spend a token calling Anthropic just to test connectivity).
// Used for ops talk in the interview ("yes, we'd point this at a load
// balancer"); not consumed by the UI.

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db/client";
import { env } from "@/shared/infrastructure/env";

export async function GET(): Promise<NextResponse> {
  const dbStatus = await db
    .execute(sql`select 1`)
    .then(() => "ok" as const)
    .catch(() => "down" as const);

  const llmStatus: "ok" | "down" = env().ANTHROPIC_API_KEY ? "ok" : "down";
  const overall = dbStatus === "ok" && llmStatus === "ok" ? "ok" : "degraded";

  return NextResponse.json(
    { status: overall, db: dbStatus, llm: llmStatus },
    { status: overall === "ok" ? 200 : 503 },
  );
}

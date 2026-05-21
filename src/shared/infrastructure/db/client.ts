// Drizzle client — wraps the `postgres` driver in a Drizzle instance.
// One pool per process. Imported only by repository adapters in infrastructure;
// never by domain or application code (enforced by ESLint in a later commit).
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/workfully_bot";

// `max: 10` is plenty for a single-pod dev environment; tune for prod via env.
const queryClient = postgres(databaseUrl, { max: 10 });

export const db = drizzle(queryClient);
export type Db = typeof db;

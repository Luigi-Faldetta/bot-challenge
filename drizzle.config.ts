// Drizzle Kit config — used by `npx drizzle-kit generate|migrate|studio`.
// Schema is the single source of truth; migrations are generated from it.
// DATABASE_URL is read from process.env; for one-off CLI use, prefix the
// command (e.g. `DATABASE_URL=... npx drizzle-kit ...`). Next.js loads
// .env.local automatically for the app process.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/shared/infrastructure/db/schema.ts",
  out: "./src/shared/infrastructure/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5433/workfully_bot",
  },
  // Be loud during interactive operations; silent in CI.
  verbose: true,
  strict: true,
});

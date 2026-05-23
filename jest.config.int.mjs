// Jest config for integration tests — runs against a real Postgres
// (docker-compose). Loads .env.local explicitly because Next.js's jest
// preset deliberately skips it in test mode (to keep dev secrets out of
// CI by default).
//
// Kept separate from the default config so `npm test` stays fast + offline.
// Run with `npm run test:int` after `docker compose up -d`.

import { loadEnvFile } from "node:process";
import nextJest from "next/jest.js";

try {
  loadEnvFile(".env.local");
} catch {
  // No .env.local — DATABASE_URL must be provided via the environment.
}

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // ONLY tests under tests/integration; unit tests stay in src/.
  testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  // Integration tests share the docker-compose DB, so they cannot truncate
  // each other's setup data in parallel. Serialise across files.
  maxWorkers: 1,
  // postgres-js keeps a connection pool open at module load (via db/client).
  // It doesn't expose a graceful close that survives Jest's module isolation,
  // so we force exit. Acceptable trade-off for an integration suite — no
  // tests would rely on the post-suite pool state.
  forceExit: true,
};

export default createJestConfig(config);

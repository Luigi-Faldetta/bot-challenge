// Jest config using Next.js' SWC-based preset. No ts-jest needed — Next.js
// compiles tests with the same toolchain as the app, so types & path aliases stay in sync.
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  // Load next.config.* and .env.* during tests, same as `next dev`.
  dir: "./",
});

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // Default: unit tests only. Integration suite gets its own script when added.
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "/tests/integration/"],
};

export default createJestConfig(config);

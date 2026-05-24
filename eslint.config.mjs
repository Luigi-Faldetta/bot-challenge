import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Hexagonal dependency rule, enforced by ESLint. The aim is that someone
// adding a new feature literally cannot pull infrastructure into the domain
// or call into the route handlers from a use case — they'd have to delete
// these rules to do it, and the diff would be obvious in code review.
//
// We allow tests (anything under __tests__) to break the rule because
// integration tests legitimately reach into infrastructure to wire up real
// adapters.

const FRAMEWORK_PACKAGES = [
  "next",
  "next/*",
  "next/**",
  "react",
  "react/*",
  "react-dom",
  "react-dom/*",
];

const INFRA_LIBRARIES = [
  "drizzle-orm",
  "drizzle-orm/*",
  "drizzle-orm/**",
  "postgres",
  "@anthropic-ai/sdk",
  "@anthropic-ai/sdk/*",
  "unpdf",
  "pino",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // ─── Domain layer ────────────────────────────────────────────────────
  // Pure, framework-free. May only import from its own bounded context's
  // domain folder + shared/domain.
  {
    files: ["src/modules/*/domain/**/*.ts", "src/shared/domain/**/*.ts"],
    ignores: ["**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/application/**", "@/modules/*/application/**"],
              message: "Domain cannot import from application. The dependency points the other way.",
            },
            {
              group: ["**/infrastructure/**", "@/modules/*/infrastructure/**", "@/shared/infrastructure/**"],
              message: "Domain cannot import from infrastructure. Use a port instead.",
            },
            {
              group: ["**/presentation/**", "@/app/**", "src/app/**"],
              message: "Domain cannot import from presentation.",
            },
            { group: FRAMEWORK_PACKAGES, message: "Domain must not import frameworks (Next/React)." },
            { group: INFRA_LIBRARIES, message: "Domain must not import infrastructure libraries. Define a port and put the adapter under infrastructure/." },
          ],
        },
      ],
    },
  },
  // ─── Application layer ───────────────────────────────────────────────
  // Use cases. May import its own domain + shared/domain + cross-context
  // domain ports. Never infrastructure, never presentation, never frameworks.
  {
    files: ["src/modules/*/application/**/*.ts"],
    ignores: ["**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/infrastructure/**", "@/modules/*/infrastructure/**", "@/shared/infrastructure/**"],
              message: "Application cannot import infrastructure directly. Depend on a port.",
            },
            {
              group: ["**/presentation/**", "@/app/**", "src/app/**"],
              message: "Application cannot import from presentation.",
            },
            { group: FRAMEWORK_PACKAGES, message: "Application must not import Next/React. Stay framework-free." },
            { group: INFRA_LIBRARIES, message: "Application must not import infrastructure libraries. Use a port + adapter." },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;

// Runtime validation of process.env. The app fails fast with a clear message
// if required vars are missing or malformed, so we never ship with a
// half-configured environment that explodes deep inside a request.
//
// ANTHROPIC_API_KEY is optional here to let developers run the UI without a
// key; the screening provider rejects loudly at point of use if it's empty.
// DATABASE_URL is required always — nothing else works without it.
//
// `env()` is lazy + memoised so importing this module is free. Validation
// runs on first access. Tests call `parseEnv(source)` directly with a
// controlled source object and never trigger the cached singleton.

import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
      "DATABASE_URL must be a postgres:// or postgresql:// URL",
    ),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Lazy + memoised accessor for the validated app env. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

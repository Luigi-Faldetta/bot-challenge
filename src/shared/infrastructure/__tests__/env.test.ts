import { parseEnv } from "@/shared/infrastructure/env";

describe("parseEnv", () => {
  it("accepts a complete valid environment", () => {
    const env = parseEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://u:p@localhost:5433/db",
      ANTHROPIC_API_KEY: "sk-ant-test",
    });
    expect(env.NODE_ENV).toBe("test");
    expect(env.DATABASE_URL).toMatch(/^postgres:\/\//);
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-test");
  });

  it("defaults NODE_ENV to development", () => {
    const env = parseEnv({
      DATABASE_URL: "postgresql://u:p@localhost:5433/db",
    });
    expect(env.NODE_ENV).toBe("development");
  });

  it("allows ANTHROPIC_API_KEY to be absent (UI-only dev workflow)", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://u:p@localhost:5433/db",
    });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("rejects a missing DATABASE_URL with a clear message", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejects a DATABASE_URL with the wrong scheme", () => {
    expect(() =>
      parseEnv({ DATABASE_URL: "mysql://u:p@localhost/db" }),
    ).toThrow(/postgres:\/\//);
  });

  it("rejects an invalid NODE_ENV", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "staging" as unknown as undefined,
        DATABASE_URL: "postgres://u:p@localhost:5433/db",
      }),
    ).toThrow(/NODE_ENV/);
  });
});

import { ok, err, isOk, isErr, type Result } from "@/shared/domain/result";

describe("Result", () => {
  it("ok carries a value and narrows via isOk", () => {
    const r: Result<number, string> = ok(42);
    expect(r.ok).toBe(true);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      // type narrowed to { ok: true; value: number }
      expect(r.value).toBe(42);
    }
  });

  it("err carries an error and narrows via isErr", () => {
    const r: Result<number, string> = err("nope");
    expect(r.ok).toBe(false);
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error).toBe("nope");
    }
  });
});

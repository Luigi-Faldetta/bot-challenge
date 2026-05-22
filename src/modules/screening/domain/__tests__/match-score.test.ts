import { MatchScore } from "@/modules/screening/domain/match-score";
import { isOk, isErr } from "@/shared/domain/result";

describe("MatchScore", () => {
  describe("create()", () => {
    it("accepts integers in [0, 100]", () => {
      for (const v of [0, 1, 49, 50, 74, 75, 99, 100]) {
        const r = MatchScore.create(v);
        expect(isOk(r)).toBe(true);
      }
    });

    it("rounds non-integers (LLM-style decimal outputs)", () => {
      const r = MatchScore.create(74.6);
      if (!isOk(r)) throw new Error("expected ok");
      expect(r.value.value).toBe(75);
    });

    it("rejects out-of-range values", () => {
      expect(isErr(MatchScore.create(-1))).toBe(true);
      expect(isErr(MatchScore.create(101))).toBe(true);
    });

    it("rejects non-finite values", () => {
      expect(isErr(MatchScore.create(NaN))).toBe(true);
      expect(isErr(MatchScore.create(Infinity))).toBe(true);
    });
  });

  describe("bands", () => {
    it.each([
      [0, "LOW"],
      [49, "LOW"],
      [50, "MEDIUM"],
      [74, "MEDIUM"],
      [75, "HIGH"],
      [100, "HIGH"],
    ] as const)("score %i → band %s", (score, expected) => {
      const r = MatchScore.create(score);
      if (!isOk(r)) throw new Error("expected ok");
      expect(r.value.band).toBe(expected);
    });
  });

  it("equality compares structurally (two scores of 80 are equal)", () => {
    const a = MatchScore.create(80);
    const b = MatchScore.create(80);
    if (!isOk(a) || !isOk(b)) throw new Error();
    expect(a.value.equals(b.value)).toBe(true);
  });
});

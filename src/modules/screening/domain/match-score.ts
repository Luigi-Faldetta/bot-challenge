// MatchScore — value object wrapping a 0..100 integer with a coarse band.
//
// Bands are kept to three (LOW / MEDIUM / HIGH) because (a) the LLM's score is
// not precise enough to justify a 4th tier, and (b) bot replies and UI
// indicators read cleanly with three. Thresholds sit at 50 and 75, the same
// breakpoints we'd defend in any recruiting context: under 50 = clear miss,
// 50–74 = needs human judgement, 75+ = strong fit.

import { ValueObject } from "@/shared/domain/value-object";
import { ok, err, type Result } from "@/shared/domain/result";

export type MatchBand = "LOW" | "MEDIUM" | "HIGH";

type Props = { value: number };

export class MatchScore extends ValueObject<Props> {
  private constructor(props: Props) {
    super(props);
  }

  static create(value: number): Result<MatchScore, string> {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return err(`MatchScore must be a finite number in [0, 100]; got ${value}`);
    }
    return ok(new MatchScore({ value: Math.round(value) }));
  }

  /** Trusts the input; for use by repositories rebuilding from a validated DB row. */
  static fromTrusted(value: number): MatchScore {
    return new MatchScore({ value });
  }

  get value(): number {
    return this.props.value;
  }

  get band(): MatchBand {
    if (this.value < 50) return "LOW";
    if (this.value < 75) return "MEDIUM";
    return "HIGH";
  }
}

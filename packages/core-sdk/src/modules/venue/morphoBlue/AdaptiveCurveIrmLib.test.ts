import { describe, expect, test } from "vitest";
import { MathLib } from "../../../math/index.js";
import { AdaptiveCurveIrmLib } from "./AdaptiveCurveIrmLib.js";

const { wExp, getBorrowRate, TARGET_UTILIZATION } = AdaptiveCurveIrmLib;

describe("AdaptiveCurveIrmLib.wExp", () => {
  test("returns 0 for very negative inputs (below LN_WEI_INT)", () => {
    expect(wExp(AdaptiveCurveIrmLib.LN_WEI_INT - 1n)).toBe(0n);
  });

  test("returns clipped upper value for inputs at/above WEXP_UPPER_BOUND", () => {
    expect(wExp(AdaptiveCurveIrmLib.WEXP_UPPER_BOUND)).toBe(AdaptiveCurveIrmLib.WEXP_UPPER_VALUE);
    expect(wExp(AdaptiveCurveIrmLib.WEXP_UPPER_BOUND + 1n)).toBe(
      AdaptiveCurveIrmLib.WEXP_UPPER_VALUE,
    );
  });

  test("wExp(0) ≈ 1 WAD", () => {
    expect(wExp(0n)).toBe(MathLib.WAD);
  });

  test("wExp(LN_2_INT) ≈ 2 WAD (within trivial Taylor error)", () => {
    expect(wExp(AdaptiveCurveIrmLib.LN_2_INT)).toBe(2n * MathLib.WAD);
  });

  test("monotonically increasing within the valid domain", () => {
    expect(wExp(MathLib.WAD / 10n)).toBeGreaterThan(wExp(0n));
    expect(wExp(MathLib.WAD)).toBeGreaterThan(wExp(MathLib.WAD / 10n));
  });

  test("wExp(-x) < WAD for x>0", () => {
    expect(wExp(-MathLib.WAD / 10n)).toBeLessThan(MathLib.WAD);
  });
});

describe("AdaptiveCurveIrmLib.getBorrowRate (first interaction, startRateAtTarget=0)", () => {
  test("returns INITIAL_RATE_AT_TARGET-based rates regardless of utilization", () => {
    const r = getBorrowRate(TARGET_UTILIZATION, 0n, 0n);
    // err = 0 -> avg/end borrow rate equals avgRateAtTarget=INITIAL_RATE_AT_TARGET
    expect(r.endRateAtTarget).toBe(AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET);
    expect(r.avgBorrowRate).toBe(AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET);
  });

  test("at zero utilization, err < 0 -> coeff applies the slow side of the curve", () => {
    const r = getBorrowRate(0n, 0n, 0n);
    // Same INITIAL_RATE_AT_TARGET endRateAtTarget; endBorrowRate < endRateAtTarget.
    expect(r.endRateAtTarget).toBe(AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET);
    expect(r.endBorrowRate).toBeLessThan(r.endRateAtTarget);
  });

  test("at full utilization, err > 0 -> coeff applies the fast side of the curve", () => {
    const r = getBorrowRate(MathLib.WAD, 0n, 0n);
    expect(r.endRateAtTarget).toBe(AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET);
    expect(r.endBorrowRate).toBeGreaterThan(r.endRateAtTarget);
  });
});

describe("AdaptiveCurveIrmLib.getBorrowRate (subsequent interaction)", () => {
  test("zero elapsed time -> rate unchanged", () => {
    const startRate = AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET;
    const r = getBorrowRate(MathLib.WAD, startRate, 0n);
    expect(r.endRateAtTarget).toBe(startRate);
  });

  test("positive elapsed time at high utilization grows endRateAtTarget toward MAX", () => {
    const startRate = AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET;
    const r = getBorrowRate(MathLib.WAD, startRate, 30n * 24n * 3600n);
    expect(r.endRateAtTarget).toBeGreaterThan(startRate);
    expect(r.endRateAtTarget).toBeLessThanOrEqual(AdaptiveCurveIrmLib.MAX_RATE_AT_TARGET);
  });

  test("positive elapsed time at zero utilization shrinks endRateAtTarget toward MIN", () => {
    const startRate = AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET;
    const r = getBorrowRate(0n, startRate, 30n * 24n * 3600n);
    expect(r.endRateAtTarget).toBeLessThan(startRate);
    expect(r.endRateAtTarget).toBeGreaterThanOrEqual(AdaptiveCurveIrmLib.MIN_RATE_AT_TARGET);
  });

  test("returned avgBorrowRate sits between start and end borrow rates", () => {
    const startRate = AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET;
    const r = getBorrowRate(MathLib.WAD, startRate, 24n * 3600n);
    expect(r.avgBorrowRate).toBeGreaterThan(0n);
    // The avg must be <= end (rate increases over time at high U).
    expect(r.avgBorrowRate).toBeLessThanOrEqual(r.endBorrowRate);
  });
});

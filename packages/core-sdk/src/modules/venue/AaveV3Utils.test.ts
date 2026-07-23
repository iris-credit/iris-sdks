import { describe, expect, test } from "vitest";
import { SECONDS_PER_YEAR } from "../../constants.js";
import { MathLib } from "../../math/index.js";
import { AaveV3Utils } from "./AaveV3Utils.js";

describe("AaveV3Utils", () => {
  describe("rayMul", () => {
    test("should round half up", () => {
      expect(AaveV3Utils.rayMul(MathLib.RAY, MathLib.RAY)).toBe(MathLib.RAY);
      expect(AaveV3Utils.rayMul(1n, MathLib.RAY / 2n)).toBe(1n);
    });
  });

  describe("getLinearInterest", () => {
    test("should accumulate the rate pro rata temporis", () => {
      // 10% over exactly one year: 1.1 RAY.
      expect(AaveV3Utils.getLinearInterest(MathLib.RAY / 10n, 0n, SECONDS_PER_YEAR)).toBe(
        MathLib.RAY + MathLib.RAY / 10n,
      );
    });

    test("should return RAY at or before the last update", () => {
      expect(AaveV3Utils.getLinearInterest(MathLib.RAY, 1_000n, 1_000n)).toBe(MathLib.RAY);
      expect(AaveV3Utils.getLinearInterest(MathLib.RAY, 1_000n, 500n)).toBe(MathLib.RAY);
    });
  });

  describe("getCompoundedInterest", () => {
    test("should return RAY at or before the last update", () => {
      expect(AaveV3Utils.getCompoundedInterest(MathLib.RAY, 1_000n, 1_000n)).toBe(MathLib.RAY);
      expect(AaveV3Utils.getCompoundedInterest(MathLib.RAY, 1_000n, 500n)).toBe(MathLib.RAY);
    });

    test("should match Aave's third-order exponential approximation", () => {
      // Reference values from aave-v3-origin v3.6 `MathUtils.calculateCompoundedInterest`:
      // RAY + x + rayMul(x, x/2 + rayMul(x, x/6)), with x = rate × elapsed / YEAR.
      expect(AaveV3Utils.getCompoundedInterest(MathLib.RAY, 0n, 2n)).toBe(
        1_000_000_063_419_585_978_551_030_828n,
      );
      // 5% over 30 days.
      expect(AaveV3Utils.getCompoundedInterest(MathLib.RAY / 20n, 0n, 2_592_000n)).toBe(
        1_004_118_044_969_757_105_730_597_891n,
      );
    });

    test("should compound above the linear accumulation", () => {
      expect(AaveV3Utils.getCompoundedInterest(MathLib.RAY, 0n, SECONDS_PER_YEAR)).toBeGreaterThan(
        AaveV3Utils.getLinearInterest(MathLib.RAY, 0n, SECONDS_PER_YEAR),
      );
    });
  });
});

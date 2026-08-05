import { describe, expect, test } from "vitest";
import { SECONDS_PER_YEAR } from "../../../constants.js";
import { MathLib } from "../../../math/index.js";
import { AaveV3Math } from "./AaveV3Math.js";

describe("AaveV3Math", () => {
  describe("rayMul", () => {
    test("should round half up", () => {
      expect(AaveV3Math.rayMul(MathLib.RAY, MathLib.RAY)).toBe(MathLib.RAY);
      expect(AaveV3Math.rayMul(1n, MathLib.RAY / 2n)).toBe(1n);
    });
  });

  describe("token balances", () => {
    test("should round aToken balances down and vToken balances up", () => {
      // 3 × 1.5 = 4.5: rounds down for collateral, up for debt.
      expect(AaveV3Math.getATokenBalance(3n, MathLib.RAY + MathLib.RAY / 2n)).toBe(4n);
      expect(AaveV3Math.getVTokenBalance(3n, MathLib.RAY + MathLib.RAY / 2n)).toBe(5n);
    });

    test("should recover the scaled balance from a fetched balance", () => {
      const index = MathLib.RAY + MathLib.RAY / 2n;

      expect(AaveV3Math.getATokenScaledBalance(AaveV3Math.getATokenBalance(3n, index), index)).toBe(
        3n,
      );
      expect(AaveV3Math.getVTokenScaledBalance(AaveV3Math.getVTokenBalance(3n, index), index)).toBe(
        3n,
      );
    });

    test("should round the scaled amount an aToken supply mints down", () => {
      // 3 / 1.5 = 2 exactly; a wei more of index still mints 2 scaled.
      expect(AaveV3Math.getATokenMintScaledAmount(3n, MathLib.RAY + MathLib.RAY / 2n)).toBe(2n);
      expect(AaveV3Math.getATokenMintScaledAmount(3n, MathLib.RAY + MathLib.RAY / 2n + 1n)).toBe(
        1n,
      );
    });
  });

  describe("percentMul", () => {
    test("should round half up", () => {
      // 3 × 50% = 1.5: rounds half up where a floor would return 1.
      expect(AaveV3Math.percentMul(3n, 5_000n)).toBe(2n);
      expect(AaveV3Math.percentMul(2n, 5_000n)).toBe(1n);
    });
  });

  describe("getLinearInterest", () => {
    test("should accumulate the rate pro rata temporis", () => {
      // 10% over exactly one year: 1.1 RAY.
      expect(AaveV3Math.getLinearInterest(MathLib.RAY / 10n, SECONDS_PER_YEAR)).toBe(
        MathLib.RAY + MathLib.RAY / 10n,
      );
    });

    test("should return RAY at zero elapsed", () => {
      expect(AaveV3Math.getLinearInterest(MathLib.RAY, 0n)).toBe(MathLib.RAY);
    });
  });

  describe("getCompoundedInterest", () => {
    test("should return RAY at zero elapsed", () => {
      expect(AaveV3Math.getCompoundedInterest(MathLib.RAY, 0n)).toBe(MathLib.RAY);
    });

    test("should match Aave's third-order exponential approximation", () => {
      // Reference values from aave-v3-origin v3.6 `MathUtils.calculateCompoundedInterest`:
      // RAY + x + rayMul(x, x/2 + rayMul(x, x/6)), with x = rate × elapsed / YEAR.
      expect(AaveV3Math.getCompoundedInterest(MathLib.RAY, 2n)).toBe(
        1_000_000_063_419_585_978_551_030_828n,
      );
      // 5% over 30 days.
      expect(AaveV3Math.getCompoundedInterest(MathLib.RAY / 20n, 2_592_000n)).toBe(
        1_004_118_044_969_757_105_730_597_891n,
      );
    });

    test("should compound above the linear accumulation", () => {
      expect(AaveV3Math.getCompoundedInterest(MathLib.RAY, SECONDS_PER_YEAR)).toBeGreaterThan(
        AaveV3Math.getLinearInterest(MathLib.RAY, SECONDS_PER_YEAR),
      );
    });
  });
});

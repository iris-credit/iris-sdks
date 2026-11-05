import { describe, expect, test } from "vitest";
import { SECONDS_PER_YEAR } from "../../../constants.js";
import { MathLib } from "../../../math/index.js";
import { AaveV3Math } from "../aaveV3/AaveV3Math.js";
import { SparkLendMath } from "./SparkLendMath.js";

describe("SparkLendMath", () => {
  describe("rayMul", () => {
    test("should round half up", () => {
      expect(SparkLendMath.rayMul(MathLib.RAY, MathLib.RAY)).toBe(MathLib.RAY);
      expect(SparkLendMath.rayMul(3n, MathLib.RAY + MathLib.RAY / 2n)).toBe(5n);
    });
  });

  describe("rayDiv", () => {
    test("should round half up", () => {
      // 3 / 2 = 1.5 rounds up; 1 / 3 rounds down.
      expect(SparkLendMath.rayDiv(3n, 2n * MathLib.RAY)).toBe(2n);
      expect(SparkLendMath.rayDiv(1n, 3n * MathLib.RAY)).toBe(0n);
    });
  });

  describe("percentMul", () => {
    test("should round half up", () => {
      expect(SparkLendMath.percentMul(3n, 5_000n)).toBe(2n);
    });
  });

  describe("percentDiv", () => {
    test("should round half up", () => {
      // 3 / 200% = 1.5 rounds up; 1 / 0.03% rounds down.
      expect(SparkLendMath.percentDiv(3n, 20_000n)).toBe(2n);
      expect(SparkLendMath.percentDiv(1n, 3n)).toBe(3_333n);
    });
  });

  describe("token balances", () => {
    test("should round spToken and vToken balances half up", () => {
      // 3 × 1.5 = 4.5 rounds up on both sides, where Aave v3.6 floors the aToken balance.
      const index = MathLib.RAY + MathLib.RAY / 2n;

      expect(SparkLendMath.getSpTokenBalance(3n, index)).toBe(5n);
      expect(SparkLendMath.getVTokenBalance(3n, index)).toBe(5n);
      expect(AaveV3Math.getATokenBalance(3n, index)).toBe(4n);
    });

    test("should recover the scaled balance from a fetched balance", () => {
      const index = MathLib.RAY + MathLib.RAY / 2n;

      expect(
        SparkLendMath.getSpTokenScaledBalance(SparkLendMath.getSpTokenBalance(3n, index), index),
      ).toBe(3n);
      expect(
        SparkLendMath.getVTokenScaledBalance(SparkLendMath.getVTokenBalance(3n, index), index),
      ).toBe(3n);
    });

    test("should round the scaled amount a mint or burn moves half up", () => {
      expect(SparkLendMath.getScaledAmount(3n, 2n * MathLib.RAY)).toBe(2n);
      expect(SparkLendMath.getScaledAmount(1n, 3n * MathLib.RAY)).toBe(0n);
    });
  });

  describe("getLinearInterest", () => {
    test("should accumulate the rate pro rata temporis", () => {
      expect(SparkLendMath.getLinearInterest(MathLib.RAY / 10n, SECONDS_PER_YEAR)).toBe(
        MathLib.RAY + MathLib.RAY / 10n,
      );
      expect(SparkLendMath.getLinearInterest(MathLib.RAY, 0n)).toBe(MathLib.RAY);
    });
  });

  describe("getCompoundedInterest", () => {
    test("should return RAY at zero elapsed", () => {
      expect(SparkLendMath.getCompoundedInterest(MathLib.RAY, 0n)).toBe(MathLib.RAY);
    });

    test("should match SparkLend's binomial approximation", () => {
      // Reference values from sparklend-v1-core `MathUtils.calculateCompoundedInterest`. They sit
      // just below Aave v3.6's exponential series for the same inputs.
      expect(SparkLendMath.getCompoundedInterest(MathLib.RAY, 2n)).toBe(
        1_000_000_063_419_584_973_040_080_661n,
      );
      // 5% over 30 days.
      expect(SparkLendMath.getCompoundedInterest(MathLib.RAY / 20n, 2_592_000n)).toBe(
        1_004_118_042_106_000_198_784_926_904n,
      );
      expect(SparkLendMath.getCompoundedInterest(MathLib.RAY / 20n, 2_592_000n)).toBeLessThan(
        AaveV3Math.getCompoundedInterest(MathLib.RAY / 20n, 2_592_000n),
      );
    });

    test("should reproduce the pool's normalized variable debt", () => {
      // SparkLend's USDC reserve at mainnet block 25_572_460: its stored index compounded over
      // the 1584 seconds since its last update equals `getReserveNormalizedVariableDebt(USDC)`.
      const factor = SparkLendMath.getCompoundedInterest(
        43_222_446_507_338_963_161_449_932n,
        1_584n,
      );

      expect(factor).toBe(1_000_002_170_992_818_952_309_155_237n);
      expect(SparkLendMath.rayMul(factor, 1_209_802_122_601_363_291_197_242_825n)).toBe(
        1_209_804_749_073_083_812_018_062_401n,
      );
    });

    test("should compound above the linear accumulation", () => {
      expect(SparkLendMath.getCompoundedInterest(MathLib.RAY, SECONDS_PER_YEAR)).toBeGreaterThan(
        SparkLendMath.getLinearInterest(MathLib.RAY, SECONDS_PER_YEAR),
      );
    });
  });

  describe("rateToApy", () => {
    test("should compound the annual rate per second over a year", () => {
      expect(SparkLendMath.rateToApy(MathLib.RAY / 5n)).toBe(221_402_757_385_561_290n);
    });
  });
});

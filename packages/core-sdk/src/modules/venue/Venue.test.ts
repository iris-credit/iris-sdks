import { describe, expect, test } from "vitest";
import { SECONDS_PER_YEAR } from "../../constants.js";
import { MathLib } from "../../math/index.js";
import { AaveV3Utils } from "./AaveV3Utils.js";
import { AaveV3Venue } from "./AaveV3Venue.js";
import { MorphoBlueUtils } from "./MorphoBlueUtils.js";
import { MorphoBlueVenue } from "./MorphoBlueVenue.js";

describe("MorphoBlueUtils", () => {
  describe("getDebtIndex", () => {
    test("should price an empty market at one virtual asset per virtual shares", () => {
      expect(MorphoBlueUtils.getDebtIndex({ totalBorrowAssets: 0n, totalBorrowShares: 0n })).toBe(
        10n ** 27n,
      );
    });

    test("should scale the borrow asset-per-share ratio by 1e33", () => {
      // (1_000_000 + 1) * 1e33 / (1_000_000 + 1e6).
      expect(
        MorphoBlueUtils.getDebtIndex({
          totalBorrowAssets: 1_000_000n,
          totalBorrowShares: 1_000_000n,
        }),
      ).toBe(500_000_500_000_000_000_000_000_000_000_000n);
    });
  });

  describe("wTaylorCompounded", () => {
    test("should return zero growth for zero elapsed time", () => {
      expect(MorphoBlueUtils.wTaylorCompounded(MathLib.WAD, 0n)).toBe(0n);
    });

    test("should match the third-order Taylor expansion", () => {
      // rate × elapsed = WAD: 1 + 1/2 + 1/6 (third-order e - 1).
      expect(MorphoBlueUtils.wTaylorCompounded(MathLib.WAD, 1n)).toBe(1_666_666_666_666_666_666n);
    });
  });
});

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

    test("should match the binomial expansion for a two-second window", () => {
      // RAY + 2 * rate / YEAR + basePowerTwo, with basePowerTwo = rayMul(RAY, RAY) / YEAR².
      expect(AaveV3Utils.getCompoundedInterest(MathLib.RAY, 0n, 2n)).toBe(
        MathLib.RAY +
          (2n * MathLib.RAY) / SECONDS_PER_YEAR +
          MathLib.RAY / (SECONDS_PER_YEAR * SECONDS_PER_YEAR),
      );
    });

    test("should compound above the linear accumulation", () => {
      expect(AaveV3Utils.getCompoundedInterest(MathLib.RAY, 0n, SECONDS_PER_YEAR)).toBeGreaterThan(
        AaveV3Utils.getLinearInterest(MathLib.RAY, 0n, SECONDS_PER_YEAR),
      );
    });
  });
});

describe("AaveV3Venue", () => {
  const venue = new AaveV3Venue({
    collateralReserve: {
      index: MathLib.RAY,
      rate: MathLib.RAY / 10n,
      lastUpdateTimestamp: 1_000n,
    },
    debtReserve: {
      index: MathLib.RAY,
      rate: MathLib.RAY / 5n,
      lastUpdateTimestamp: 1_000n,
    },
  });

  test("should return the stored indices at or before the reserves' last update", () => {
    expect(venue.indices(1_000n)).toEqual({
      collateralIndex: MathLib.RAY,
      debtIndex: MathLib.RAY,
    });
    expect(venue.indices(500n)).toEqual({
      collateralIndex: MathLib.RAY,
      debtIndex: MathLib.RAY,
    });
  });

  test("should project the collateral index linearly", () => {
    // 10% over exactly one year on a RAY index.
    expect(venue.indices(1_000n + SECONDS_PER_YEAR).collateralIndex).toBe(
      MathLib.RAY + MathLib.RAY / 10n,
    );
  });

  test("should project the debt index with compounding", () => {
    const { debtIndex } = venue.indices(1_000n + SECONDS_PER_YEAR);

    // Compounded 20% over a year: above the linear 1.2 RAY.
    expect(debtIndex).toBeGreaterThan(MathLib.RAY + MathLib.RAY / 5n);
  });
});

describe("MorphoBlueVenue", () => {
  const venue = new MorphoBlueVenue({
    totalBorrowAssets: MathLib.WAD,
    totalBorrowShares: MathLib.WAD * 1_000_000n,
    lastUpdate: 1_000n,
    borrowRate: 1_268_391_679n, // ~4% per year, per-second WAD rate.
  });

  test("should pin the collateral index and price the debt index at or before the last update", () => {
    const indices = venue.indices(1_000n);

    expect(indices.collateralIndex).toBe(MathLib.RAY);
    expect(indices.debtIndex).toBe(
      MorphoBlueUtils.getDebtIndex({
        totalBorrowAssets: MathLib.WAD,
        totalBorrowShares: MathLib.WAD * 1_000_000n,
      }),
    );
    expect(venue.indices(500n)).toEqual(indices);
  });

  test("should project the debt index by compounding the borrow assets", () => {
    const indices = venue.indices(1_000n + SECONDS_PER_YEAR);

    // ~4% compounded over a year, growing borrow assets only — shares are accrual-invariant.
    expect(indices.debtIndex).toBe(
      MorphoBlueUtils.getDebtIndex({
        totalBorrowAssets:
          MathLib.WAD +
          MathLib.wMulDown(
            MathLib.WAD,
            MorphoBlueUtils.wTaylorCompounded(1_268_391_679n, SECONDS_PER_YEAR),
          ),
        totalBorrowShares: MathLib.WAD * 1_000_000n,
      }),
    );
    expect(indices.debtIndex).toBeGreaterThan(venue.indices(1_000n).debtIndex);
    expect(indices.collateralIndex).toBe(MathLib.RAY);
  });
});

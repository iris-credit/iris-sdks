import { describe, expect, test } from "vitest";
import { MathLib } from "../../math/index.js";
import { MorphoBlueUtils } from "./MorphoBlueUtils.js";

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

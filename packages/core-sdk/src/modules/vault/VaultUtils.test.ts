import { describe, expect, test } from "vitest";
import { VaultUtils } from "./VaultUtils.js";

describe("VaultUtils", () => {
  describe("decimalsOffset", () => {
    test("should offset from 18 share decimals by default", () => {
      expect(VaultUtils.decimalsOffset(6n)).toBe(12n);
      expect(VaultUtils.decimalsOffset(18n)).toBe(0n);
    });

    test("should floor at zero when the asset has more decimals than the shares", () => {
      expect(VaultUtils.decimalsOffset(24n)).toBe(0n);
    });

    test("should honor an explicit share decimals count", () => {
      expect(VaultUtils.decimalsOffset(6n, 27n)).toBe(21n);
    });

    test("should accept BigIntish inputs", () => {
      expect(VaultUtils.decimalsOffset(6)).toBe(12n);
      expect(VaultUtils.decimalsOffset("6")).toBe(12n);
    });
  });

  describe("toAssets", () => {
    test("should round down by default", () => {
      // 1 * (2 + 1) / (1 + 1) = 1.5 -> 1.
      expect(
        VaultUtils.toAssets(1n, { totalAssets: 2n, totalSupply: 1n, decimalsOffset: 0n }),
      ).toBe(1n);
    });

    test("should honor an explicit rounding direction", () => {
      const vault = { totalAssets: 2n, totalSupply: 1n, decimalsOffset: 0n };

      expect(VaultUtils.toAssets(1n, vault, "Down")).toBe(1n);
      expect(VaultUtils.toAssets(1n, vault, "Up")).toBe(2n);
    });
  });

  describe("toShares", () => {
    test("should round up by default", () => {
      // 1 * (1 + 1) / (2 + 1) = 0.66… -> 1.
      expect(
        VaultUtils.toShares(1n, { totalAssets: 2n, totalSupply: 1n, decimalsOffset: 0n }),
      ).toBe(1n);
    });

    test("should honor an explicit rounding direction", () => {
      const vault = { totalAssets: 2n, totalSupply: 1n, decimalsOffset: 0n };

      expect(VaultUtils.toShares(1n, vault, "Down")).toBe(0n);
      expect(VaultUtils.toShares(1n, vault, "Up")).toBe(1n);
    });

    test("should mint assets * 10 ** decimalsOffset shares into an empty vault", () => {
      // The virtual offset dilutes the very first deposit, guarding against
      // share-price inflation: 1 asset -> 1e6 shares, redeemable for 1 asset.
      const empty = { totalAssets: 0n, totalSupply: 0n, decimalsOffset: 6n };

      expect(VaultUtils.toShares(1n, empty)).toBe(1_000_000n);
      expect(VaultUtils.toAssets(1_000_000n, empty)).toBe(1n);
    });
  });

  test("should accept BigIntish amounts and vault totals", () => {
    expect(VaultUtils.toAssets("1", { totalAssets: 2, totalSupply: 1, decimalsOffset: 0 })).toBe(
      1n,
    );
  });
});

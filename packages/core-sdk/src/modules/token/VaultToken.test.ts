import { describe, expect, test } from "vitest";
import { VaultToken } from "./VaultToken.js";

const VAULT = "0x3333333333333333333333333333333333333333";
const ASSET = "0x2222222222222222222222222222222222222222";

// totalAssets/totalSupply of 1000/500 with a zero decimals offset.
const vault = () =>
  new VaultToken(
    { address: VAULT, asset: ASSET, decimalsOffset: 0n },
    { totalAssets: 1_000n, totalSupply: 500n },
  );

describe("VaultToken", () => {
  describe("constructor", () => {
    test("should store the vault accounting fields", () => {
      const token = new VaultToken(
        { address: VAULT, asset: ASSET, decimalsOffset: 2n },
        { totalAssets: 1_000n, totalSupply: 500n },
      );

      expect(token.address).toBe(VAULT);
      expect(token.asset).toBe(ASSET);
      expect(token.decimalsOffset).toBe(2n);
      expect(token.totalAssets).toBe(1_000n);
      expect(token.totalSupply).toBe(500n);
    });

    test("should use the asset as the wrapped token's underlying", () => {
      expect(vault().underlying).toBe(ASSET);
    });

    test("should default decimals to 0 since the config omits them", () => {
      expect(vault().decimals).toBe(0);
    });
  });

  describe("wrapped-token conversions", () => {
    test("should convert assets to shares, rounding down", () => {
      // toShares(101, Down) = 101 * 501 / 1001 = 50.55 -> 50.
      expect(vault().toWrappedExactAmountIn(101n)).toBe(50n);
    });

    test("should convert shares to assets, rounding down", () => {
      // toAssets(50, Down) = 50 * 1001 / 501 = 99.9 -> 99.
      expect(vault().toUnwrappedExactAmountIn(50n)).toBe(99n);
    });
  });

  describe("toShares", () => {
    test("should round shares up by default", () => {
      // toShares(101, Up) = ceil(101 * 501 / 1001) = ceil(50.55) = 51.
      expect(vault().toShares(101n)).toBe(51n);
    });

    test("should honor an explicit rounding direction", () => {
      expect(vault().toShares(101n, "Down")).toBe(50n);
    });
  });

  describe("toAssets", () => {
    test("should round assets down by default", () => {
      // toAssets(50, Down) = 50 * 1001 / 501 = 99.9 -> 99.
      expect(vault().toAssets(50n)).toBe(99n);
    });

    test("should honor an explicit rounding direction", () => {
      // toAssets(50, Up) = ceil(99.9) = 100.
      expect(vault().toAssets(50n, "Up")).toBe(100n);
    });
  });
});

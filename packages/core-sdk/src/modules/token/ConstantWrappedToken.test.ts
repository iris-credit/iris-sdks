import { describe, expect, test } from "vitest";
import { ConstantWrappedToken } from "./ConstantWrappedToken.js";

const WRAPPED = "0x1111111111111111111111111111111111111111";
const UNDERLYING = "0x2222222222222222222222222222222222222222";

const WAD = 1_000_000_000_000_000_000n;

describe("ConstantWrappedToken", () => {
  describe("constructor", () => {
    test("should store the underlying decimals as a bigint", () => {
      const token = new ConstantWrappedToken({ address: WRAPPED, decimals: 18 }, UNDERLYING, 6);

      expect(token.underlying).toBe(UNDERLYING);
      expect(token.underlyingDecimals).toBe(6n);
    });

    test("should default the underlying decimals to 0", () => {
      const token = new ConstantWrappedToken({ address: WRAPPED, decimals: 18 }, UNDERLYING);

      expect(token.underlyingDecimals).toBe(0n);
    });

    test("should coerce the underlying decimals from BigIntish", () => {
      const token = new ConstantWrappedToken({ address: WRAPPED, decimals: 18 }, UNDERLYING, "6");

      expect(token.underlyingDecimals).toBe(6n);
    });
  });

  describe("conversions (18 wrapped / 6 underlying)", () => {
    const token = new ConstantWrappedToken({ address: WRAPPED, decimals: 18 }, UNDERLYING, 6);

    test("should scale up by 10 ** (decimals - underlyingDecimals) when wrapping", () => {
      // 1e6 underlying (1.0 unit) -> 1e18 wrapped (1.0 unit).
      expect(token.toWrappedExactAmountIn(1_000_000n)).toBe(WAD);
    });

    test("should scale down when unwrapping the same amount back", () => {
      expect(token.toUnwrappedExactAmountIn(WAD)).toBe(1_000_000n);
    });

    test("should report the unwrapped amount required for an exact wrapped output", () => {
      expect(token.toWrappedExactAmountOut(WAD)).toBe(1_000_000n);
    });

    test("should report the wrapped amount required for an exact unwrapped output", () => {
      expect(token.toUnwrappedExactAmountOut(1_000_000n)).toBe(WAD);
    });

    test("should ignore slippage on every conversion (always treats it as 0)", () => {
      const slippage = WAD / 100n;

      expect(token.toWrappedExactAmountIn(1_000_000n, slippage)).toBe(
        token.toWrappedExactAmountIn(1_000_000n),
      );
      expect(token.toUnwrappedExactAmountIn(WAD, slippage)).toBe(
        token.toUnwrappedExactAmountIn(WAD),
      );
      expect(token.toWrappedExactAmountOut(WAD, slippage)).toBe(token.toWrappedExactAmountOut(WAD));
      expect(token.toUnwrappedExactAmountOut(1_000_000n, slippage)).toBe(
        token.toUnwrappedExactAmountOut(1_000_000n),
      );
    });
  });

  describe("conversions (6 wrapped / 18 underlying)", () => {
    const token = new ConstantWrappedToken({ address: WRAPPED, decimals: 6 }, UNDERLYING, 18);

    test("should floor to zero when scaling down loses all precision", () => {
      // 1 wei underlying * 1e6 / 1e18 floors to 0.
      expect(token.toWrappedExactAmountIn(1n)).toBe(0n);
    });

    test("should convert cleanly when the amount divides the scale", () => {
      expect(token.toWrappedExactAmountIn(WAD)).toBe(1_000_000n);
    });
  });
});

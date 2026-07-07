import { describe, expect, test } from "vitest";
import { MathLib } from "../../math/index.js";
import { ExchangeRateWrappedToken } from "./ExchangeRateWrappedToken.js";

const { WAD } = MathLib;

const WRAPPED = "0x1111111111111111111111111111111111111111";
const UNDERLYING = "0x2222222222222222222222222222222222222222";

const token = (rate: bigint) =>
  new ExchangeRateWrappedToken({ address: WRAPPED, decimals: 18 }, UNDERLYING, rate);

describe("ExchangeRateWrappedToken", () => {
  describe("constructor", () => {
    test("should store the exchange rate and underlying address", () => {
      const t = token(2n * WAD);

      expect(t.underlying).toBe(UNDERLYING);
      expect(t.wrappedTokenExchangeRate).toBe(2n * WAD);
    });
  });

  describe("toWrappedExactAmountIn", () => {
    test("should divide the unwrapped amount by the rate", () => {
      // 1 unwrapped / 2.0 rate = 0.5 wrapped.
      expect(token(2n * WAD).toWrappedExactAmountIn(WAD)).toBe(WAD / 2n);
    });

    test("should propagate the rounding direction through the division", () => {
      // 1 / 3.0 = 0.333…: floors down, ceils up.
      expect(token(3n * WAD).toWrappedExactAmountIn(WAD, 0n, "Down")).toBe(
        333_333_333_333_333_333n,
      );
      expect(token(3n * WAD).toWrappedExactAmountIn(WAD, 0n, "Up")).toBe(333_333_333_333_333_334n);
    });

    test("should reduce the expected output by the slippage", () => {
      // At rate 1.0 the wrap is 1 WAD; a 1% slippage keeps 0.99 WAD.
      expect(token(WAD).toWrappedExactAmountIn(WAD)).toBe(WAD);
      expect(token(WAD).toWrappedExactAmountIn(WAD, WAD / 100n)).toBe(990_000_000_000_000_000n);
    });
  });

  describe("toUnwrappedExactAmountIn", () => {
    test("should multiply the wrapped amount by the rate", () => {
      // 1 wrapped * 2.0 rate = 2 unwrapped.
      expect(token(2n * WAD).toUnwrappedExactAmountIn(WAD)).toBe(2n * WAD);
    });

    test("should reduce the expected output by the slippage", () => {
      // At rate 1.0 the unwrap is 1 WAD; a 1% slippage keeps 0.99 WAD.
      expect(token(WAD).toUnwrappedExactAmountIn(WAD, WAD / 100n)).toBe(990_000_000_000_000_000n);
    });

    test("should round-trip a wrap back to the original for a whole rate", () => {
      const t = token(4n * WAD);
      const wrapped = t.toWrappedExactAmountIn(WAD);

      expect(t.toUnwrappedExactAmountIn(wrapped)).toBe(WAD);
    });
  });

  describe("toWrappedExactAmountOut", () => {
    test("should report the unwrapped amount required for an exact wrapped output", () => {
      // To receive 1 wrapped at rate 2.0, 2 unwrapped must be supplied.
      expect(token(2n * WAD).toWrappedExactAmountOut(WAD)).toBe(2n * WAD);
    });

    test("should require more input as the slippage grows", () => {
      const t = token(2n * WAD);

      expect(t.toWrappedExactAmountOut(WAD, WAD / 100n)).toBeGreaterThan(
        t.toWrappedExactAmountOut(WAD),
      );
    });
  });

  describe("toUnwrappedExactAmountOut", () => {
    test("should report the wrapped amount required for an exact unwrapped output", () => {
      // To receive 2 unwrapped at rate 2.0, 1 wrapped must be supplied.
      expect(token(2n * WAD).toUnwrappedExactAmountOut(2n * WAD)).toBe(WAD);
    });

    test("should require more input as the slippage grows", () => {
      const t = token(2n * WAD);

      expect(t.toUnwrappedExactAmountOut(2n * WAD, WAD / 100n)).toBeGreaterThan(
        t.toUnwrappedExactAmountOut(2n * WAD),
      );
    });
  });
});

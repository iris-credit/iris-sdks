import type { BigIntish } from "../../../types.js";

import { SECONDS_PER_YEAR } from "../../../constants.js";
import { MathLib } from "../../../math/index.js";

/**
 * Namespace of utility functions to ease Aave V3 venue-index and token-balance
 * calculations.
 */
export namespace AaveV3Math {
  /** Aave's `PercentageMath.PERCENTAGE_FACTOR` — percentages are carried in basis points. */
  export const PERCENTAGE_FACTOR = 10_000n;

  /**
   * Multiplies two RAY-scaled values, rounding half up, matching Aave's `WadRayMath.rayMul`.
   *
   * @param a The first RAY-scaled factor.
   * @param b The second RAY-scaled factor.
   * @returns `a × b` (scaled by RAY, rounded half up).
   * @example
   * ```ts
   * import { AaveV3Math, MathLib } from "@iris-credit/core-sdk";
   *
   * const product = AaveV3Math.rayMul(1n, MathLib.RAY / 2n);
   * // product === 1n (0.5 rounds half up, where rounding down would return 0)
   * ```
   */
  export const rayMul = (a: BigIntish, b: BigIntish) => {
    a = BigInt(a);
    b = BigInt(b);

    return (a * b + MathLib.RAY / 2n) / MathLib.RAY;
  };

  /**
   * Multiplies a value by a basis-points percentage, rounding half up, matching Aave's
   * `PercentageMath.percentMul`.
   *
   * @param value The value to take the percentage of.
   * @param percentage The percentage (in basis points).
   * @returns `value × percentage` (rounded half up).
   * @example
   * ```ts
   * import { AaveV3Math } from "@iris-credit/core-sdk";
   *
   * const cut = AaveV3Math.percentMul(3n, 5_000n);
   * // cut === 2n (1.5 rounds half up)
   * ```
   */
  export const percentMul = (value: BigIntish, percentage: BigIntish) => {
    value = BigInt(value);
    percentage = BigInt(percentage);

    return (value * percentage + PERCENTAGE_FACTOR / 2n) / PERCENTAGE_FACTOR;
  };

  /**
   * Returns the aToken balance for a scaled balance at the given liquidity index, rounding
   * down, matching Aave v3.6's `TokenMath.getATokenBalance` (`AToken.balanceOf`).
   *
   * @param scaledAmount The scaled aToken balance.
   * @param liquidityIndex The liquidity index (scaled by RAY).
   * @returns The aToken balance in underlying units.
   * @example
   * ```ts
   * import { AaveV3Math, MathLib } from "@iris-credit/core-sdk";
   *
   * const balance = AaveV3Math.getATokenBalance(3n, MathLib.RAY + MathLib.RAY / 2n);
   * // balance === 4n (4.5 rounds down, where getVTokenBalance would return 5)
   * ```
   */
  export const getATokenBalance = (scaledAmount: BigIntish, liquidityIndex: BigIntish) =>
    MathLib.mulDivDown(scaledAmount, liquidityIndex, MathLib.RAY);

  /**
   * Returns the scaled balance backing an aToken balance observed at the given liquidity
   * index — the exact inverse of {@link getATokenBalance}: an index of at least RAY gives
   * every balance a unique scaled preimage, and rounding up recovers it. The balance and
   * index must be observed at the same block.
   *
   * @dev Formula-equal to Aave v3.6's `TokenMath.getATokenBurnScaledAmount`.
   * @param balance The aToken balance in underlying units.
   * @param liquidityIndex The liquidity index the balance was observed at (scaled by RAY).
   * @returns The scaled aToken balance.
   */
  export const getATokenScaledBalance = (balance: BigIntish, liquidityIndex: BigIntish) =>
    MathLib.mulDivUp(balance, MathLib.RAY, liquidityIndex);

  /**
   * Returns the scaled aToken amount a supply of `amount` mints at the given liquidity
   * index, rounding down, matching Aave v3.6's `TokenMath.getATokenMintScaledAmount`.
   *
   * @param amount The supplied amount in underlying units.
   * @param liquidityIndex The liquidity index at the supply (scaled by RAY).
   * @returns The scaled aToken amount minted.
   * @example
   * ```ts
   * import { AaveV3Math, MathLib } from "@iris-credit/core-sdk";
   *
   * const scaled = AaveV3Math.getATokenMintScaledAmount(3n, MathLib.RAY + MathLib.RAY / 2n);
   * // scaled === 2n (3 / 1.5, rounded down)
   * ```
   */
  export const getATokenMintScaledAmount = (amount: BigIntish, liquidityIndex: BigIntish) =>
    MathLib.mulDivDown(amount, MathLib.RAY, liquidityIndex);

  /**
   * Returns the vToken balance (debt) for a scaled balance at the given borrow index,
   * rounding up, matching Aave v3.6's `TokenMath.getVTokenBalance`
   * (`VariableDebtToken.balanceOf`).
   *
   * @param scaledAmount The scaled vToken balance.
   * @param variableBorrowIndex The variable borrow index (scaled by RAY).
   * @returns The vToken balance (debt) in underlying units.
   * @example
   * ```ts
   * import { AaveV3Math, MathLib } from "@iris-credit/core-sdk";
   *
   * const debt = AaveV3Math.getVTokenBalance(3n, MathLib.RAY + MathLib.RAY / 2n);
   * // debt === 5n (4.5 rounds up, where getATokenBalance would return 4)
   * ```
   */
  export const getVTokenBalance = (scaledAmount: BigIntish, variableBorrowIndex: BigIntish) =>
    MathLib.mulDivUp(scaledAmount, variableBorrowIndex, MathLib.RAY);

  /**
   * Returns the scaled balance backing a vToken balance observed at the given borrow
   * index — the exact inverse of {@link getVTokenBalance}: an index of at least RAY gives
   * every balance a unique scaled preimage, and rounding down recovers it. The balance and
   * index must be observed at the same block.
   *
   * @dev Formula-equal to Aave v3.6's `TokenMath.getVTokenBurnScaledAmount`.
   * @param balance The vToken balance (debt) in underlying units.
   * @param variableBorrowIndex The variable borrow index the balance was observed at
   *   (scaled by RAY).
   * @returns The scaled vToken balance.
   */
  export const getVTokenScaledBalance = (balance: BigIntish, variableBorrowIndex: BigIntish) =>
    MathLib.mulDivDown(balance, MathLib.RAY, variableBorrowIndex);

  /**
   * Returns the linearly accumulated interest factor between the last update and the given
   * timestamp, matching Aave's `MathUtils.calculateLinearInterest` (used for the liquidity
   * index). A timestamp at or before the last update returns RAY (no accrual).
   *
   * @param rate The annual rate (scaled by RAY).
   * @param elapsed The elapsed time in seconds.
   * @returns The interest factor (scaled by RAY).
   * @example
   * ```ts
   * import { AaveV3Math, MathLib } from "@iris-credit/core-sdk";
   *
   * const factor = AaveV3Math.getLinearInterest(MathLib.RAY / 10n, 31_536_000n);
   * // factor === 1.1 RAY (10% over exactly one year)
   * ```
   */
  export const getLinearInterest = (rate: BigIntish, elapsed: BigIntish) => {
    rate = BigInt(rate);
    elapsed = BigInt(elapsed);

    return MathLib.RAY + (rate * elapsed) / SECONDS_PER_YEAR;
  };

  /**
   * Returns the compounded interest factor between the last update and the given timestamp,
   * matching Aave's `MathUtils.calculateCompoundedInterest` third-order approximation of
   * `e^(rate × elapsed / year)` — `1 + x + x²/2 + x³/6` with `x = rate × elapsed / year`
   * (used for the variable borrow index). A timestamp at or before the last update returns
   * RAY (no accrual).
   *
   * @param rate The annual rate (scaled by RAY).
   * @param elapsed The elapsed time in seconds.
   * @returns The interest factor (scaled by RAY).
   * @example
   * ```ts
   * import { AaveV3Math, MathLib } from "@iris-credit/core-sdk";
   *
   * const factor = AaveV3Math.getCompoundedInterest(MathLib.RAY / 20n, 2_592_000n);
   * // factor === 1_004_118_044_969_757_105_730_597_891n (5% compounded over 30 days)
   * ```
   */
  export const getCompoundedInterest = (rate: BigIntish, elapsed: BigIntish) => {
    rate = BigInt(rate);
    elapsed = BigInt(elapsed);

    if (elapsed === 0n) return MathLib.RAY;

    const x = (rate * elapsed) / SECONDS_PER_YEAR;

    return MathLib.RAY + x + rayMul(x, x / 2n + rayMul(x, x / 6n));
  };
}

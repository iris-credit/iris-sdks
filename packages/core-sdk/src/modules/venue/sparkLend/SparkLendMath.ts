import type { BigIntish } from "../../../types.js";

import { SECONDS_PER_YEAR } from "../../../constants.js";
import { MathLib } from "../../../math/index.js";
import { AaveV3Math } from "../aaveV3/AaveV3Math.js";

/**
 * Namespace of utility functions to ease SparkLend venue-index and token-balance calculations.
 *
 * SparkLend runs `sparklend-v1-core`, an Aave V3.0 core fork that predates Aave's later math
 * changes, so two things differ from {@link AaveV3Math}:
 *
 * - token balances, mints and burns round half up through `rayMul` and `rayDiv`, where Aave
 *   v3.6 floors aToken amounts and ceils debt amounts;
 * - the variable borrow index compounds with the binomial `MathUtils.calculateCompoundedInterest`
 *   of Aave V3.0, not the exponential series of later Aave releases.
 *
 * Functions the two cores share delegate to {@link AaveV3Math}.
 */
export namespace SparkLendMath {
  /** SparkLend's `PercentageMath.PERCENTAGE_FACTOR` — percentages are carried in basis points. */
  export const PERCENTAGE_FACTOR = AaveV3Math.PERCENTAGE_FACTOR;

  /**
   * Multiplies two RAY-scaled values, rounding half up, matching SparkLend's `WadRayMath.rayMul`
   * (the same as {@link AaveV3Math.rayMul}).
   *
   * @param a The first RAY-scaled factor.
   * @param b The second RAY-scaled factor.
   * @returns `a × b` (scaled by RAY, rounded half up).
   * @example
   * ```ts
   * import { MathLib, SparkLendMath } from "@iris-credit/core-sdk";
   *
   * const product = SparkLendMath.rayMul(3n, MathLib.RAY + MathLib.RAY / 2n);
   * // product === 5n (4.5 rounds half up)
   * ```
   */
  export const rayMul = AaveV3Math.rayMul;

  /**
   * Divides a value by a RAY-scaled one, rounding half up, matching SparkLend's
   * `WadRayMath.rayDiv`.
   *
   * @param a The dividend.
   * @param b The RAY-scaled divisor.
   * @returns `a / b` (scaled by RAY, rounded half up).
   * @example
   * ```ts
   * import { MathLib, SparkLendMath } from "@iris-credit/core-sdk";
   *
   * const quotient = SparkLendMath.rayDiv(3n, 2n * MathLib.RAY);
   * // quotient === 2n (1.5 rounds half up)
   * ```
   */
  export const rayDiv = (a: BigIntish, b: BigIntish) => {
    a = BigInt(a);
    b = BigInt(b);

    return (a * MathLib.RAY + b / 2n) / b;
  };

  /**
   * Multiplies a value by a basis-points percentage, rounding half up, matching SparkLend's
   * `PercentageMath.percentMul` (the same as {@link AaveV3Math.percentMul}).
   *
   * @param value The value to take the percentage of.
   * @param percentage The percentage (in basis points).
   * @returns `value × percentage` (rounded half up).
   * @example
   * ```ts
   * import { SparkLendMath } from "@iris-credit/core-sdk";
   *
   * const cut = SparkLendMath.percentMul(3n, 5_000n);
   * // cut === 2n (1.5 rounds half up)
   * ```
   */
  export const percentMul = AaveV3Math.percentMul;

  /**
   * Divides a value by a basis-points percentage, rounding half up, matching SparkLend's
   * `PercentageMath.percentDiv` — how `validateBorrow` turns a debt into the collateral it needs.
   *
   * @param value The value to divide.
   * @param percentage The percentage (in basis points).
   * @returns `value / percentage` (rounded half up).
   * @example
   * ```ts
   * import { SparkLendMath } from "@iris-credit/core-sdk";
   *
   * const needed = SparkLendMath.percentDiv(3n, 20_000n);
   * // needed === 2n (1.5 rounds half up)
   * ```
   */
  export const percentDiv = (value: BigIntish, percentage: BigIntish) => {
    value = BigInt(value);
    percentage = BigInt(percentage);

    return (value * PERCENTAGE_FACTOR + percentage / 2n) / percentage;
  };

  /**
   * Returns the spToken balance for a scaled balance at the given liquidity index, rounding half
   * up, matching the spToken's `balanceOf` (Aave's `AToken` code).
   *
   * @param scaledAmount The scaled spToken balance.
   * @param liquidityIndex The liquidity index (scaled by RAY).
   * @returns The spToken balance in underlying units.
   * @example
   * ```ts
   * import { MathLib, SparkLendMath } from "@iris-credit/core-sdk";
   *
   * const balance = SparkLendMath.getSpTokenBalance(3n, MathLib.RAY + MathLib.RAY / 2n);
   * // balance === 5n (4.5 rounds half up, where Aave v3.6 would floor to 4)
   * ```
   */
  export const getSpTokenBalance = (scaledAmount: BigIntish, liquidityIndex: BigIntish) =>
    rayMul(scaledAmount, liquidityIndex);

  /**
   * Returns the scaled balance backing a spToken balance observed at the given liquidity index —
   * the inverse of {@link getSpTokenBalance}: at an index of at least RAY, `rayDiv` recovers the
   * scaled balance `rayMul` rounded. The balance and index must be observed at the same block.
   *
   * @param balance The spToken balance in underlying units.
   * @param liquidityIndex The liquidity index the balance was observed at (scaled by RAY).
   * @returns The scaled spToken balance.
   * @example
   * ```ts
   * import { MathLib, SparkLendMath } from "@iris-credit/core-sdk";
   *
   * const scaled = SparkLendMath.getSpTokenScaledBalance(5n, MathLib.RAY + MathLib.RAY / 2n);
   * // scaled === 3n
   * ```
   */
  export const getSpTokenScaledBalance = (balance: BigIntish, liquidityIndex: BigIntish) =>
    rayDiv(balance, liquidityIndex);

  /**
   * Returns the variable debt for a scaled balance at the given borrow index, rounding half up,
   * matching SparkLend's `VariableDebtToken.balanceOf`.
   *
   * @param scaledAmount The scaled variable debt balance.
   * @param variableBorrowIndex The variable borrow index (scaled by RAY).
   * @returns The variable debt in underlying units.
   * @example
   * ```ts
   * import { MathLib, SparkLendMath } from "@iris-credit/core-sdk";
   *
   * const debt = SparkLendMath.getVTokenBalance(3n, MathLib.RAY + MathLib.RAY / 2n);
   * // debt === 5n (4.5 rounds half up)
   * ```
   */
  export const getVTokenBalance = (scaledAmount: BigIntish, variableBorrowIndex: BigIntish) =>
    rayMul(scaledAmount, variableBorrowIndex);

  /**
   * Returns the scaled balance backing a variable debt observed at the given borrow index — the
   * inverse of {@link getVTokenBalance}. The debt and index must be observed at the same block.
   *
   * @param balance The variable debt in underlying units.
   * @param variableBorrowIndex The variable borrow index the debt was observed at (scaled by RAY).
   * @returns The scaled variable debt balance.
   * @example
   * ```ts
   * import { MathLib, SparkLendMath } from "@iris-credit/core-sdk";
   *
   * const scaled = SparkLendMath.getVTokenScaledBalance(5n, MathLib.RAY + MathLib.RAY / 2n);
   * // scaled === 3n
   * ```
   */
  export const getVTokenScaledBalance = (balance: BigIntish, variableBorrowIndex: BigIntish) =>
    rayDiv(balance, variableBorrowIndex);

  /**
   * Returns the scaled amount a mint or burn of `amount` moves at the given index, rounding half
   * up, matching SparkLend's `ScaledBalanceTokenBase` (supply, withdraw, borrow and repay all
   * scale through `rayDiv`).
   *
   * @param amount The amount in underlying units.
   * @param index The reserve index at the operation (scaled by RAY).
   * @returns The scaled amount minted or burnt.
   * @example
   * ```ts
   * import { MathLib, SparkLendMath } from "@iris-credit/core-sdk";
   *
   * const scaled = SparkLendMath.getScaledAmount(3n, 2n * MathLib.RAY);
   * // scaled === 2n (1.5 rounds half up)
   * ```
   */
  export const getScaledAmount = (amount: BigIntish, index: BigIntish) => rayDiv(amount, index);

  /**
   * Returns the linearly accumulated interest factor between the last update and the given
   * timestamp, matching SparkLend's `MathUtils.calculateLinearInterest` (used for the liquidity
   * index; the same as {@link AaveV3Math.getLinearInterest}).
   *
   * @param rate The annual rate (scaled by RAY).
   * @param elapsed The elapsed time in seconds.
   * @returns The interest factor (scaled by RAY).
   * @example
   * ```ts
   * import { MathLib, SparkLendMath } from "@iris-credit/core-sdk";
   *
   * const factor = SparkLendMath.getLinearInterest(MathLib.RAY / 10n, 31_536_000n);
   * // factor === 1.1 RAY (10% over exactly one year)
   * ```
   */
  export const getLinearInterest = AaveV3Math.getLinearInterest;

  /**
   * Returns the compounded interest factor between the last update and the given timestamp,
   * matching SparkLend's `MathUtils.calculateCompoundedInterest`: the binomial approximation of
   * `(1 + rate / year) ^ elapsed` truncated after the third term,
   * `1 + n·r + n(n-1)/2·r² + n(n-1)(n-2)/6·r³` with `r = rate / year` per second and
   * `n = elapsed` (used for the variable borrow index). Each power term is floored as the contract
   * floors it. A zero elapsed returns RAY.
   *
   * @param rate The annual rate (scaled by RAY).
   * @param elapsed The elapsed time in seconds.
   * @returns The interest factor (scaled by RAY).
   * @example
   * ```ts
   * import { MathLib, SparkLendMath } from "@iris-credit/core-sdk";
   *
   * const factor = SparkLendMath.getCompoundedInterest(MathLib.RAY / 20n, 2_592_000n);
   * // factor === 1_004_118_042_106_000_198_784_926_904n (5% compounded over 30 days)
   * ```
   */
  export const getCompoundedInterest = (rate: BigIntish, elapsed: BigIntish) => {
    rate = BigInt(rate);
    elapsed = BigInt(elapsed);

    if (elapsed === 0n) return MathLib.RAY;

    const elapsedMinusOne = elapsed - 1n;
    const elapsedMinusTwo = elapsed > 2n ? elapsed - 2n : 0n;

    const basePowerTwo = rayMul(rate, rate) / (SECONDS_PER_YEAR * SECONDS_PER_YEAR);
    const basePowerThree = rayMul(basePowerTwo, rate) / SECONDS_PER_YEAR;

    const secondTerm = (elapsed * elapsedMinusOne * basePowerTwo) / 2n;
    const thirdTerm = (elapsed * elapsedMinusOne * elapsedMinusTwo * basePowerThree) / 6n;

    return MathLib.RAY + (rate * elapsed) / SECONDS_PER_YEAR + secondTerm + thirdTerm;
  };

  /**
   * Returns the annual rate compounded per second over a year — the APY the Spark app displays,
   * through the same exact per-second compounding as {@link AaveV3Math.rateToApy}.
   *
   * @param rate The annual rate to compound per second (scaled by RAY).
   * @returns The annual percentage yield (scaled by WAD).
   * @example
   * ```ts
   * import { MathLib, SparkLendMath } from "@iris-credit/core-sdk";
   *
   * const apy = SparkLendMath.rateToApy(MathLib.RAY / 5n); // 20% annual rate
   * // apy === 221_402_757_385_561_290n (~22.14%)
   * ```
   */
  export const rateToApy = AaveV3Math.rateToApy;
}

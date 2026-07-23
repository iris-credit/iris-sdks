import type { BigIntish } from "../../types.js";

import { SECONDS_PER_YEAR } from "../../constants.js";
import { MathLib } from "../../math/index.js";

/**
 * Namespace of utility functions to ease Aave V3 venue-index calculations.
 *
 * Mirrors the Aave venue adapter's onchain `indices` definition so the offline projections
 * stay consistent with the values Iris stores on positions: Aave's normalized income /
 * variable debt interest factors (Aave V3 `MathUtils`) with `WadRayMath` rounding.
 */
export namespace AaveV3Utils {
  /**
   * Multiplies two RAY-scaled values, rounding half up, matching Aave's `WadRayMath.rayMul`.
   *
   * @param a The first RAY-scaled factor.
   * @param b The second RAY-scaled factor.
   * @returns `a × b` (scaled by RAY, rounded half up).
   */
  export const rayMul = (a: BigIntish, b: BigIntish) => {
    a = BigInt(a);
    b = BigInt(b);

    return (a * b + MathLib.RAY / 2n) / MathLib.RAY;
  };

  /**
   * Returns the linearly accumulated interest factor between the last update and the given
   * timestamp, matching Aave's `MathUtils.calculateLinearInterest` (used for the liquidity
   * index). A timestamp at or before the last update returns RAY (no accrual).
   *
   * @param rate The annual rate (scaled by RAY).
   * @param lastUpdateTimestamp The reserve's last update timestamp (in seconds).
   * @param timestamp The timestamp to accumulate to (in seconds).
   * @returns The interest factor (scaled by RAY).
   * @example
   * ```ts
   * import { AaveV3Utils, MathLib } from "@iris-credit/core-sdk";
   *
   * const factor = AaveV3Utils.getLinearInterest(MathLib.RAY / 10n, 0n, 31_536_000n);
   * // factor === 1.1 RAY (10% over exactly one year)
   * ```
   */
  export const getLinearInterest = (
    rate: BigIntish,
    lastUpdateTimestamp: BigIntish,
    timestamp: BigIntish,
  ) => {
    rate = BigInt(rate);
    const elapsed = MathLib.zeroFloorSub(timestamp, lastUpdateTimestamp);

    return MathLib.RAY + (rate * elapsed) / SECONDS_PER_YEAR;
  };

  /**
   * Returns the compounded interest factor between the last update and the given timestamp,
   * matching Aave's `MathUtils.calculateCompoundedInterest` binomial approximation
   * `(1 + x)^n ≈ 1 + nx + n(n-1)x²/2 + n(n-1)(n-2)x³/6` (used for the variable borrow index).
   * A timestamp at or before the last update returns RAY (no accrual).
   *
   * @param rate The annual rate (scaled by RAY).
   * @param lastUpdateTimestamp The reserve's last update timestamp (in seconds).
   * @param timestamp The timestamp to compound to (in seconds).
   * @returns The interest factor (scaled by RAY).
   */
  export const getCompoundedInterest = (
    rate: BigIntish,
    lastUpdateTimestamp: BigIntish,
    timestamp: BigIntish,
  ) => {
    rate = BigInt(rate);
    const elapsed = MathLib.zeroFloorSub(timestamp, lastUpdateTimestamp);
    if (elapsed === 0n) return MathLib.RAY;

    const elapsedMinusOne = elapsed - 1n;
    const elapsedMinusTwo = elapsed > 2n ? elapsed - 2n : 0n;

    const basePowerTwo = rayMul(rate, rate) / (SECONDS_PER_YEAR * SECONDS_PER_YEAR);
    const basePowerThree = rayMul(basePowerTwo, rate) / SECONDS_PER_YEAR;

    const secondTerm = (elapsed * elapsedMinusOne * basePowerTwo) / 2n;
    const thirdTerm = (elapsed * elapsedMinusOne * elapsedMinusTwo * basePowerThree) / 6n;

    return MathLib.RAY + (rate * elapsed) / SECONDS_PER_YEAR + secondTerm + thirdTerm;
  };
}

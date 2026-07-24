import type { BigIntish } from "../../../types.js";

import { MathLib } from "../../../math/index.js";

/**
 * Namespace of utility functions to ease Morpho Blue venue-index calculations.
 */
export namespace MorphoBlueMath {
  /** The Morpho adapter's pinned collateral index — Morpho Blue collateral is idle. */
  export const COLLATERAL_INDEX = MathLib.RAY;
  /** The Morpho adapter's borrow index scale. */
  export const INDEX_SCALE = 10n ** 33n;
  /** Morpho Blue's virtual borrow assets (inflation-attack guard baked into share pricing). */
  export const VIRTUAL_ASSETS = 1n;
  /** Morpho Blue's virtual borrow shares (inflation-attack guard baked into share pricing). */
  export const VIRTUAL_SHARES = 1_000_000n;

  /**
   * Returns the compounded interest accumulated over the elapsed time at the given per-second
   * rate, as a WAD-scaled growth fraction, matching Morpho Blue's onchain
   * `MathLib.wTaylorCompounded` third-order Taylor expansion of `e^(rate × elapsed) - 1`.
   *
   * @param rate The borrow rate per second (scaled by WAD).
   * @param elapsed The elapsed time to compound over (in seconds).
   * @returns The growth fraction (scaled by WAD).
   * @example
   * ```ts
   * import { MathLib, MorphoBlueMath } from "@iris-credit/core-sdk";
   *
   * const growth = MorphoBlueMath.wTaylorCompounded(MathLib.WAD, 1n);
   * // growth === 1_666_666_666_666_666_666n (1 + 1/2 + 1/6, third-order e - 1)
   * ```
   */
  export const wTaylorCompounded = (rate: BigIntish, elapsed: BigIntish) => {
    rate = BigInt(rate);
    elapsed = BigInt(elapsed);

    const firstTerm = rate * elapsed;
    const secondTerm = MathLib.mulDivDown(firstTerm, firstTerm, 2n * MathLib.WAD);
    const thirdTerm = MathLib.mulDivDown(secondTerm, firstTerm, 3n * MathLib.WAD);

    return firstTerm + secondTerm + thirdTerm;
  };
}

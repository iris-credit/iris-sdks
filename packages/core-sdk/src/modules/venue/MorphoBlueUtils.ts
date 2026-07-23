import type { BigIntish } from "../../types.js";

import { MathLib } from "../../math/index.js";

/**
 * Namespace of utility functions to ease Morpho Blue venue-index calculations.
 *
 * Mirrors the Morpho venue adapter's onchain `indices` definition so the offline projections
 * stay consistent with the values Iris stores on positions: the virtual-shares-adjusted borrow
 * asset-per-share index, grown with Morpho Blue's `MathLib.wTaylorCompounded`.
 */
export namespace MorphoBlueUtils {
  /** The Morpho adapter's pinned collateral index — Morpho Blue collateral is idle. */
  export const COLLATERAL_INDEX = MathLib.RAY;
  /** The Morpho adapter's borrow index scale. */
  export const INDEX_SCALE = 10n ** 33n;
  /** Morpho Blue's virtual borrow assets (inflation-attack guard baked into share pricing). */
  export const VIRTUAL_ASSETS = 1n;
  /** Morpho Blue's virtual borrow shares (inflation-attack guard baked into share pricing). */
  export const VIRTUAL_SHARES = 1_000_000n;

  /**
   * Returns the Morpho venue's borrow index for the given market totals, matching the Morpho
   * adapter's onchain definition: the borrow asset-per-share ratio, virtual-shares adjusted and
   * scaled by {@link INDEX_SCALE}, rounded down.
   *
   * @param market.totalBorrowAssets The market's total borrow assets (with pending interest).
   * @param market.totalBorrowShares The market's total borrow shares.
   * @returns The borrow index (scaled by 1e33).
   * @example
   * ```ts
   * import { MorphoBlueUtils } from "@iris-credit/core-sdk";
   *
   * const debtIndex = MorphoBlueUtils.getDebtIndex({
   *   totalBorrowAssets: 0n,
   *   totalBorrowShares: 0n,
   * });
   * // debtIndex === 10n ** 27n (empty market: 1 virtual asset per 1e6 virtual shares)
   * ```
   */
  export const getDebtIndex = (market: {
    totalBorrowAssets: BigIntish;
    totalBorrowShares: BigIntish;
  }) => {
    market.totalBorrowAssets = BigInt(market.totalBorrowAssets);
    market.totalBorrowShares = BigInt(market.totalBorrowShares);

    return MathLib.mulDivDown(
      market.totalBorrowAssets + VIRTUAL_ASSETS,
      INDEX_SCALE,
      market.totalBorrowShares + VIRTUAL_SHARES,
    );
  };

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
   * import { MathLib, MorphoBlueUtils } from "@iris-credit/core-sdk";
   *
   * const growth = MorphoBlueUtils.wTaylorCompounded(MathLib.WAD, 1n);
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

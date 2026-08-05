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

  /**
   * Returns the borrow shares equivalent to the given borrow assets, rounding down, matching
   * Morpho Blue's onchain `SharesMathLib.toSharesDown` (the amount of shares a repayment
   * burns).
   *
   * @param assets The borrow assets to convert.
   * @param totalAssets The market's total borrow assets.
   * @param totalShares The market's total borrow shares.
   * @returns The equivalent borrow shares.
   * @example
   * ```ts
   * import { MathLib, MorphoBlueMath } from "@iris-credit/core-sdk";
   *
   * const shares = MorphoBlueMath.toSharesDown(MathLib.WAD, MathLib.WAD, MathLib.WAD * 1_000_000n);
   * // shares === 1000000000000000000000000n
   * ```
   */
  export const toSharesDown = (assets: BigIntish, totalAssets: BigIntish, totalShares: BigIntish) =>
    MathLib.mulDivDown(
      assets,
      BigInt(totalShares) + VIRTUAL_SHARES,
      BigInt(totalAssets) + VIRTUAL_ASSETS,
    );

  /**
   * Returns the borrow shares equivalent to the given borrow assets, rounding up, matching
   * Morpho Blue's onchain `SharesMathLib.toSharesUp` (the amount of shares a borrow mints,
   * rounded against the borrower).
   *
   * @param assets The borrow assets to convert.
   * @param totalAssets The market's total borrow assets.
   * @param totalShares The market's total borrow shares.
   * @returns The equivalent borrow shares.
   * @example
   * ```ts
   * import { MathLib, MorphoBlueMath } from "@iris-credit/core-sdk";
   *
   * const shares = MorphoBlueMath.toSharesUp(MathLib.WAD, MathLib.WAD, MathLib.WAD * 1_000_000n);
   * // shares === 1000000000000000000000000n
   * ```
   */
  export const toSharesUp = (assets: BigIntish, totalAssets: BigIntish, totalShares: BigIntish) =>
    MathLib.mulDivUp(
      assets,
      BigInt(totalShares) + VIRTUAL_SHARES,
      BigInt(totalAssets) + VIRTUAL_ASSETS,
    );

  /**
   * Returns the borrow assets equivalent to the given borrow shares, rounding down, matching
   * Morpho Blue's onchain `SharesMathLib.toAssetsDown`.
   *
   * @param shares The borrow shares to convert.
   * @param totalAssets The market's total borrow assets.
   * @param totalShares The market's total borrow shares.
   * @returns The equivalent borrow assets.
   * @example
   * ```ts
   * import { MorphoBlueMath } from "@iris-credit/core-sdk";
   *
   * const assets = MorphoBlueMath.toAssetsDown(1_000_000n, 0n, 0n);
   * // assets === 1n (VIRTUAL_SHARES per VIRTUAL_ASSET on an empty market)
   * ```
   */
  export const toAssetsDown = (shares: BigIntish, totalAssets: BigIntish, totalShares: BigIntish) =>
    MathLib.mulDivDown(
      shares,
      BigInt(totalAssets) + VIRTUAL_ASSETS,
      BigInt(totalShares) + VIRTUAL_SHARES,
    );
}

import type { BigIntish } from "../../types.js";
import type { VenueIndices } from "./Venue.js";

import { MathLib } from "../../math/index.js";
import { MorphoBlueUtils } from "./MorphoBlueUtils.js";
import { Venue } from "./Venue.js";

/** Plain input shape for a Morpho Blue venue: the market state a projection needs. */
export interface IMorphoBlueVenue {
  /** The market's total borrow assets at `lastUpdate`. */
  totalBorrowAssets: bigint;
  /** The market's total borrow shares (accrual-invariant). */
  totalBorrowShares: bigint;
  /** The market's last accrual timestamp (in seconds). */
  lastUpdate: bigint;
  /** The market's current borrow rate per second (scaled by WAD), from `IIrm.borrowRateView`. */
  borrowRate: bigint;
}

/**
 * Represents a Morpho Blue venue: the market backing the loan, with Morpho's interest math
 * used to project the borrow index.
 *
 * Mirrors the Morpho venue adapter's onchain `indices`: the collateral index is pinned to RAY
 * (Morpho Blue collateral is idle) and the debt index is the virtual-shares-adjusted borrow
 * asset-per-share ratio (see {@link MorphoBlueUtils.getDebtIndex}). Projection mirrors
 * Morpho Blue's onchain `_accrueInterest`: the current borrow rate held constant, compounded
 * with {@link MorphoBlueUtils.wTaylorCompounded} — only `totalBorrowAssets` grows, as accrual
 * never mints borrow shares.
 */
export class MorphoBlueVenue extends Venue implements IMorphoBlueVenue {
  public totalBorrowAssets: bigint;
  public totalBorrowShares: bigint;
  public lastUpdate: bigint;
  public borrowRate: bigint;

  constructor(venue: IMorphoBlueVenue) {
    super();

    this.totalBorrowAssets = venue.totalBorrowAssets;
    this.totalBorrowShares = venue.totalBorrowShares;
    this.lastUpdate = venue.lastUpdate;
    this.borrowRate = venue.borrowRate;
  }

  /**
   * Returns the venue indices projected to the given timestamp, compounding the market's
   * borrow assets from its `lastUpdate` at the current borrow rate.
   *
   * @param timestamp - The timestamp to project to (in seconds).
   * @returns The pinned collateral index (RAY) and the projected borrow index (scaled by 1e33).
   */
  public indices(timestamp: BigIntish): VenueIndices {
    const interest = MathLib.wMulDown(
      this.totalBorrowAssets,
      MorphoBlueUtils.wTaylorCompounded(
        this.borrowRate,
        MathLib.zeroFloorSub(timestamp, this.lastUpdate),
      ),
    );

    return {
      collateralIndex: MorphoBlueUtils.COLLATERAL_INDEX,
      debtIndex: MorphoBlueUtils.getDebtIndex({
        totalBorrowAssets: this.totalBorrowAssets + interest,
        totalBorrowShares: this.totalBorrowShares,
      }),
    };
  }
}

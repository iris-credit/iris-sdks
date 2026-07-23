import type { BigIntish } from "../../types.js";
import type { VenueIndices } from "./Venue.js";

import { MathLib } from "../../math/index.js";
import { AdaptiveCurveIrmLib } from "./AdaptiveCurveIrmLib.js";
import { MorphoBlueUtils } from "./MorphoBlueUtils.js";
import { Venue } from "./Venue.js";

/** Plain input shape for a Morpho Blue venue: the market state a projection needs. */
export interface IMorphoBlueVenue {
  totalSupplyAssets: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
  rateAtTarget?: bigint;
}

/**
 * Represents a Morpho Blue venue: the market backing the loan, with Morpho's interest math
 * used to project the borrow index.
 */
export class MorphoBlueVenue extends Venue implements IMorphoBlueVenue {
  /**
   * The market's total supply assets at `lastUpdate` (drives the IRM's utilization).
   */
  public totalSupplyAssets: bigint;
  /**
   * The market's total borrow assets at `lastUpdate`.
   */
  public totalBorrowAssets: bigint;
  /**
   * The market's total borrow shares (accrual-invariant).
   */
  public totalBorrowShares: bigint;
  /**
   * The market's last accrual timestamp (in seconds).
   */
  public lastUpdate: bigint;
  /**
   * The market's `rateAtTarget` (per second, scaled by WAD), when it uses the canonical
   * Adaptive Curve IRM.
   */
  public rateAtTarget?: bigint;

  constructor(venue: IMorphoBlueVenue) {
    super();

    this.totalSupplyAssets = venue.totalSupplyAssets;
    this.totalBorrowAssets = venue.totalBorrowAssets;
    this.totalBorrowShares = venue.totalBorrowShares;
    this.lastUpdate = venue.lastUpdate;
    this.rateAtTarget = venue.rateAtTarget;
  }

  /**
   * The market's utilization at `lastUpdate` (scaled by WAD), as the IRM computes it.
   */
  get utilization() {
    return this.totalSupplyAssets > 0n
      ? MathLib.wDivDown(this.totalBorrowAssets, this.totalSupplyAssets)
      : 0n;
  }

  /**
   * Returns the venue indices projected to the given timestamp, compounding the market's
   * borrow assets from its `lastUpdate` at the Adaptive Curve IRM's average borrow rate —
   * markets without {@link rateAtTarget} (not on the canonical IRM) accrue at a zero rate.
   *
   * @param timestamp - The timestamp to project to (in seconds).
   * @returns The pinned collateral index (RAY) and the projected borrow index (RAY).
   */
  public indices(timestamp: BigIntish): VenueIndices {
    const elapsed = MathLib.zeroFloorSub(timestamp, this.lastUpdate);

    const borrowRate =
      this.rateAtTarget != null
        ? AdaptiveCurveIrmLib.getBorrowRate(this.utilization, this.rateAtTarget, elapsed)
            .avgBorrowRate
        : 0n;

    const interest = MathLib.wMulDown(
      this.totalBorrowAssets,
      MorphoBlueUtils.wTaylorCompounded(borrowRate, elapsed),
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

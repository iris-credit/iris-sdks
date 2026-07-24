import type { BigIntish } from "../../../types.js";
import type { IVenue } from "../Venue.js";

import { IrisCoreErrors } from "../../../errors.js";
import { MathLib } from "../../../math/index.js";
import { Venue } from "../Venue.js";
import { AdaptiveCurveIrmLib } from "./AdaptiveCurveIrmLib.js";
import { MorphoBlueMath } from "./MorphoBlueMath.js";

/** Plain input shape for a Morpho Blue venue's market: the state an accrual needs. */
export interface IMorphoBlueMarket {
  totalSupplyAssets: bigint;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  lastUpdate: bigint;
}

/** Plain input shape for the pod's Morpho Blue position primitives. */
export interface IMorphoBluePosition {
  borrowShares: bigint;
  collateral: bigint;
}

/**
 * Represents a Morpho Blue venue: the market backing the loan and the pod's position on
 * it, with Morpho's interest math used to accrue the borrow side.
 */
export class MorphoBlueVenue extends Venue {
  /**
   * The market state at its `lastUpdate`.
   */
  public market: IMorphoBlueMarket;
  /**
   * The pod's position primitives on the market (borrow shares are accrual-invariant).
   */
  public position: IMorphoBluePosition;
  /**
   * The market's `rateAtTarget` (per second, scaled by WAD), when it uses the canonical
   * Adaptive Curve IRM.
   */
  public rateAtTarget?: bigint;

  constructor(
    venue: IVenue,
    market: IMorphoBlueMarket,
    position: IMorphoBluePosition,
    rateAtTarget?: bigint,
  ) {
    super(venue);

    this.market = market;
    this.position = position;
    this.rateAtTarget = rateAtTarget;
  }

  /**
   * The market's utilization at `lastUpdate` (scaled by WAD), as the IRM computes it.
   */
  get utilization() {
    return this.market.totalSupplyAssets > 0n
      ? MathLib.wDivDown(this.market.totalBorrowAssets, this.market.totalSupplyAssets)
      : 0n;
  }

  /**
   * Returns a new venue accrued up to the given timestamp, compounding the market's borrow
   * assets from its `lastUpdate` at the Adaptive Curve IRM's average borrow rate and
   * crediting the interest to the supply assets, as Morpho's `_accrueInterest` does —
   * markets without {@link rateAtTarget} (not on the canonical IRM) accrue at a zero rate.
   * The market and its rate-at-target re-anchor at the accrued state; the collateral index
   * stays pinned (idle collateral).
   *
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   */
  public accrueInterest(timestamp: BigIntish = this.lastUpdate): MorphoBlueVenue {
    timestamp = BigInt(timestamp);

    const interest = this.getAccrualTotalBorrowAssets(timestamp) - this.market.totalBorrowAssets;

    return new MorphoBlueVenue(
      this.accruedView(timestamp),
      {
        ...this.market,
        totalSupplyAssets: this.market.totalSupplyAssets + interest,
        totalBorrowAssets: this.market.totalBorrowAssets + interest,
        lastUpdate: timestamp,
      },
      this.position,
      this.rateAtTarget != null
        ? AdaptiveCurveIrmLib.getBorrowRate(
            this.utilization,
            this.rateAtTarget,
            timestamp - this.market.lastUpdate,
          ).endRateAtTarget
        : undefined,
    );
  }

  /**
   * Returns the pod's collateral, unchanged: Morpho Blue collateral is idle. Throws on a
   * timestamp prior to the market's last update.
   */
  public getAccrualCollateral(timestamp: BigIntish): bigint {
    timestamp = BigInt(timestamp);

    if (timestamp < this.market.lastUpdate) {
      throw new IrisCoreErrors.InvalidVenueInterestAccrual(
        "collateral",
        timestamp,
        this.market.lastUpdate,
      );
    }

    return this.position.collateral;
  }

  /**
   * Returns the pod's debt accrued up to the given timestamp: its borrow shares priced on
   * the accrued market, rounding up like Morpho's `expectedBorrowAssets`.
   */
  public getAccrualDebt(timestamp: BigIntish): bigint {
    return MathLib.mulDivUp(
      this.position.borrowShares,
      this.getAccrualTotalBorrowAssets(timestamp) + MorphoBlueMath.VIRTUAL_ASSETS,
      this.market.totalBorrowShares + MorphoBlueMath.VIRTUAL_SHARES,
    );
  }

  /**
   * Returns the pinned collateral index: Morpho Blue collateral accrues no yield. Throws
   * on a timestamp prior to the market's last update.
   */
  public getAccrualCollateralIndex(timestamp: BigIntish): bigint {
    timestamp = BigInt(timestamp);

    if (timestamp < this.market.lastUpdate) {
      throw new IrisCoreErrors.InvalidVenueInterestAccrual(
        "collateral",
        timestamp,
        this.market.lastUpdate,
      );
    }

    return MorphoBlueMath.COLLATERAL_INDEX;
  }

  /**
   * Returns the debt index accrued up to the given timestamp, priced on the accrued
   * market (scaled by RAY).
   */
  public getAccrualDebtIndex(timestamp: BigIntish): bigint {
    return MathLib.mulDivDown(
      this.getAccrualTotalBorrowAssets(timestamp) + MorphoBlueMath.VIRTUAL_ASSETS,
      MorphoBlueMath.INDEX_SCALE,
      this.market.totalBorrowShares + MorphoBlueMath.VIRTUAL_SHARES,
    );
  }

  /**
   * Returns a new venue accrued to the given timestamp with the collateral supplied on
   * top — both the live view and the pod's position primitive move (Morpho Blue
   * collateral is idle).
   *
   * @param amount - The collateral amount to supply.
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   */
  public supplyCollateral(amount: bigint, timestamp?: BigIntish): MorphoBlueVenue {
    const venue = this.accrueInterest(timestamp);

    venue.collateral += amount;
    venue.position = { ...venue.position, collateral: venue.position.collateral + amount };

    return new MorphoBlueVenue(venue, venue.market, venue.position, venue.rateAtTarget);
  }

  /**
   * Returns a new venue accrued to the given timestamp with the collateral withdrawn —
   * both the live view and the pod's position primitive move — keeping the pod's venue
   * position healthy (see `Venue.isHealthy`).
   *
   * @param amount - The collateral amount to withdraw.
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   * @throws {IrisCoreErrors.UnknownVenuePrice} When the venue price is unknown.
   * @throws {IrisCoreErrors.InsufficientVenueCollateral} When the withdrawal would leave
   *   the venue position unhealthy.
   */
  public withdrawCollateral(amount: bigint, timestamp?: BigIntish): MorphoBlueVenue {
    if (this.price == null) throw new IrisCoreErrors.UnknownVenuePrice(this.pod, this.id);

    const venue = this.accrueInterest(timestamp);

    venue.collateral -= amount;
    venue.position = { ...venue.position, collateral: venue.position.collateral - amount };

    if (venue.collateral < 0n || !venue.isHealthy) {
      throw new IrisCoreErrors.InsufficientVenueCollateral(venue.pod, venue.id);
    }

    return new MorphoBlueVenue(venue, venue.market, venue.position, venue.rateAtTarget);
  }

  /**
   * Returns the market's total borrow assets accrued up to the given timestamp at the
   * IRM's average borrow rate. Throws on a timestamp prior to the market's last update.
   */
  protected getAccrualTotalBorrowAssets(timestamp: BigIntish): bigint {
    timestamp = BigInt(timestamp);

    const elapsed = timestamp - this.market.lastUpdate;
    if (elapsed < 0n) {
      throw new IrisCoreErrors.InvalidVenueInterestAccrual(
        "debt",
        timestamp,
        this.market.lastUpdate,
      );
    }

    const borrowRate =
      this.rateAtTarget != null
        ? AdaptiveCurveIrmLib.getBorrowRate(this.utilization, this.rateAtTarget, elapsed)
            .avgBorrowRate
        : 0n;

    return (
      this.market.totalBorrowAssets +
      MathLib.wMulDown(
        this.market.totalBorrowAssets,
        MorphoBlueMath.wTaylorCompounded(borrowRate, elapsed),
      )
    );
  }
}

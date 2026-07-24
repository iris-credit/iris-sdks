import type { BigIntish } from "../../../types.js";
import type { IVenue } from "../Venue.js";

import { IrisCoreErrors } from "../../../errors.js";
import { Venue } from "../Venue.js";
import { AaveV3Math } from "./AaveV3Math.js";

/** Plain input shape for one side of an Aave V3 venue: the reserve state a projection needs. */
export interface IAaveReserve {
  /** The reserve's stored index — `liquidityIndex` (collateral) or `variableBorrowIndex` (debt), scaled by RAY. */
  index: bigint;
  /** The reserve's current annual rate — `currentLiquidityRate` or `currentVariableBorrowRate`, scaled by RAY. */
  rate: bigint;
  /** The reserve's `lastUpdateTimestamp` (in seconds). */
  lastUpdateTimestamp: bigint;
}

/**
 * Represents an Aave V3 venue: the collateral and debt reserves backing the loan, with Aave's
 * interest model used to project the reserve indices.
 */
export class AaveV3Venue extends Venue {
  /**
   * The collateral asset's reserve state.
   */
  public collateralReserve: IAaveReserve;
  /**
   * The debt asset's reserve state.
   */
  public debtReserve: IAaveReserve;

  constructor(venue: IVenue, collateralReserve: IAaveReserve, debtReserve: IAaveReserve) {
    super(venue);

    this.collateralReserve = collateralReserve;
    this.debtReserve = debtReserve;
  }

  /**
   * Returns a new venue accrued up to the given timestamp, accumulating each reserve's
   * interest from its own `lastUpdateTimestamp` with Aave's math — linear for the
   * liquidity index, compounded for the variable borrow index. The reserves re-anchor at
   * the accrued indices and timestamp.
   *
   * @param timestamp - The timestamp to accrue to (in seconds).
   */
  public accrueInterest(timestamp: BigIntish): AaveV3Venue {
    timestamp = BigInt(timestamp);

    if (timestamp < this.lastUpdate) {
      throw new IrisCoreErrors.InvalidInterestAccrual(timestamp, this.lastUpdate);
    }

    return new AaveV3Venue(
      this.accruedView(timestamp),
      {
        ...this.collateralReserve,
        index: this.getAccrualCollateralIndex(timestamp),
        lastUpdateTimestamp: timestamp,
      },
      {
        ...this.debtReserve,
        index: this.getAccrualDebtIndex(timestamp),
        lastUpdateTimestamp: timestamp,
      },
    );
  }

  /**
   * Returns the pod's aToken balance accrued up to the given timestamp, via Aave's
   * scaled-balance round-trip.
   */
  public getAccrualCollateral(timestamp: BigIntish): bigint {
    return AaveV3Math.getATokenBalance(
      AaveV3Math.getATokenScaledBalance(this.collateral, this.collateralIndex),
      this.getAccrualCollateralIndex(timestamp),
    );
  }

  /**
   * Returns the pod's variable debt accrued up to the given timestamp, via Aave's
   * scaled-balance round-trip.
   */
  public getAccrualDebt(timestamp: BigIntish): bigint {
    return AaveV3Math.getVTokenBalance(
      AaveV3Math.getVTokenScaledBalance(this.debt, this.debtIndex),
      this.getAccrualDebtIndex(timestamp),
    );
  }

  /**
   * Returns the liquidity index accrued linearly from the collateral reserve's
   * `lastUpdateTimestamp` (scaled by RAY). Throws on a timestamp prior to it.
   */
  public getAccrualCollateralIndex(timestamp: BigIntish): bigint {
    timestamp = BigInt(timestamp);

    const elapsed = timestamp - this.collateralReserve.lastUpdateTimestamp;
    if (elapsed < 0n) {
      throw new IrisCoreErrors.InvalidVenueInterestAccrual(
        "collateral",
        timestamp,
        this.collateralReserve.lastUpdateTimestamp,
      );
    }

    return AaveV3Math.rayMul(
      AaveV3Math.getLinearInterest(this.collateralReserve.rate, elapsed),
      this.collateralReserve.index,
    );
  }

  /**
   * Returns the variable borrow index compounded from the debt reserve's
   * `lastUpdateTimestamp` (scaled by RAY). Throws on a timestamp prior to it.
   */
  public getAccrualDebtIndex(timestamp: BigIntish): bigint {
    timestamp = BigInt(timestamp);

    const elapsed = timestamp - this.debtReserve.lastUpdateTimestamp;
    if (elapsed < 0n) {
      throw new IrisCoreErrors.InvalidVenueInterestAccrual(
        "debt",
        timestamp,
        this.debtReserve.lastUpdateTimestamp,
      );
    }

    return AaveV3Math.rayMul(
      AaveV3Math.getCompoundedInterest(this.debtReserve.rate, elapsed),
      this.debtReserve.index,
    );
  }

  // more and more supply collateral makes prediction worse as reserves are not updated
  public supplyCollateral(amount: bigint, timestamp: BigIntish): AaveV3Venue {
    const venue = this.accrueInterest(timestamp);

    venue.collateral += amount;

    return new AaveV3Venue(venue, venue.collateralReserve, venue.debtReserve);
  }

  public withdrawCollateral(amount: bigint, timestamp: BigIntish): AaveV3Venue {
    if (this.price == null) throw new IrisCoreErrors.UnknownVenuePrice(this.pod, this.id);

    const venue = this.accrueInterest(timestamp);

    venue.collateral -= amount;

    if (venue.collateral < 0n || !venue.isHealthy) {
      throw new IrisCoreErrors.InsufficientVenueCollateral(venue.pod, venue.id);
    }

    return new AaveV3Venue(venue, venue.collateralReserve, venue.debtReserve);
  }
}

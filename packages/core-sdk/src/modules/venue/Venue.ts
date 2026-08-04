import type { Address, Hex } from "viem";
import type { VenueName } from "../../registries.js";
import type { BigIntish } from "../../types.js";

import { ORACLE_PRICE_SCALE } from "../../constants.js";
import { IrisCoreErrors } from "../../errors.js";
import { MathLib } from "../../math/index.js";
import { PositionUtils } from "../position/PositionUtils.js";

/** Plain input shape for a venue's view of a pod. */
export interface IVenue {
  id: bigint;
  data: Hex;
  pod: Address;
  collateral: bigint;
  debt: bigint;
  collateralIndex: bigint;
  debtIndex: bigint;
  lltv: bigint;
  price?: bigint;
  lastUpdate: bigint;
}

/**
 * Represents a venue's view of a pod: the pair-level observations (indices, price, LLTV)
 * and the pod's assets on the venue.
 *
 * @dev All fields are live onchain observations and MUST be fetched from the venue adapter
 * at the block being evaluated — never reused from an older block. Position math composed
 * with stale venue data (e.g. accrual with old indices, health checks with an old price)
 * silently diverges from Iris's onchain results.
 */
export abstract class Venue implements IVenue {
  /**
   * The name of the venue this instance models, as keyed in the chain registries' `venues`;
   * discriminates `Venue` unions without `instanceof`.
   */
  public abstract readonly name: VenueName;
  /**
   * The venue ID.
   */
  public readonly id: bigint;
  /**
   * The venue-specific market data identifying this venue to its adapter.
   */
  public readonly data: Hex;
  /**
   * The pod this view is of.
   */
  public readonly pod: Address;
  /**
   * The pod's collateral on the venue, from `IVenueAdapter.positionAssets`, in collateral
   * token units.
   */
  public collateral: bigint;
  /**
   * The pod's debt on the venue, from `IVenueAdapter.positionAssets`, in debt token units.
   */
  public debt: bigint;
  /**
   * The venue's current collateral index, from `IVenueAdapter.indices` (scaled by RAY).
   */
  public collateralIndex: bigint;
  /**
   * The venue's current debt index, from `IVenueAdapter.indices` (scaled by RAY).
   */
  public debtIndex: bigint;
  /**
   * The venue's LLTV for the loan's token pair, from `IVenueAdapter.lltv` (scaled by WAD).
   */
  public lltv: bigint;
  /**
   * The collateral price quoted in debt assets, from `IVenueAdapter.price` (scaled by
   * ORACLE_PRICE_SCALE), or `undefined` when unknown.
   */
  public price?: bigint;
  /**
   * The timestamp when the venue data was last updated, in seconds.
   */
  public lastUpdate: bigint;

  constructor(venue: IVenue) {
    this.id = venue.id;
    this.data = venue.data;
    this.pod = venue.pod;
    this.collateral = venue.collateral;
    this.debt = venue.debt;
    this.collateralIndex = venue.collateralIndex;
    this.debtIndex = venue.debtIndex;
    this.lltv = venue.lltv;
    this.price = venue.price;
    this.lastUpdate = venue.lastUpdate;
  }

  /**
   * Whether the pod's position is healthy on the venue: the debt within the venue's LLTV
   * limit of the collateral's value, or `undefined` when the price is unknown.
   */
  get isHealthy() {
    const collateralValue = PositionUtils.getCollateralValue(
      { collateral: this.collateral },
      { price: this.price },
    );
    if (collateralValue == null) return;

    const maxDebt = MathLib.mulDivDown(collateralValue, this.lltv, MathLib.WAD);

    return this.debt <= maxDebt;
  }

  /**
   * The collateral price quoted in debt assets below which the venue can liquidate the
   * pod's position: the venue debt no longer fits the venue's LLTV limit of the
   * collateral's value (see `isHealthy`). `null` when the pod has no venue debt and
   * `MathLib.MAX_UINT_256` on zero collateral power.
   */
  get liquidationPrice() {
    if (this.debt === 0n) return null;

    const collateralPower = MathLib.mulDivDown(this.collateral, this.lltv, MathLib.WAD);
    if (collateralPower === 0n) return MathLib.MAX_UINT_256;

    return MathLib.mulDivUp(this.debt, ORACLE_PRICE_SCALE, collateralPower);
  }

  /**
   * The price variation required for the pod's position to reach its liquidation price
   * (see `liquidationPrice`, scaled by WAD). Negative when healthy (the price needs to
   * drop x%), positive when unhealthy (the price needs to soar x%). `undefined` when the
   * price is unknown; `null` on a zero price or when the pod has no venue debt.
   */
  get priceVariationToLiquidationPrice() {
    if (this.price == null) return;
    if (this.price === 0n) return null;

    const liquidationPrice = this.liquidationPrice;
    if (liquidationPrice == null) return null;

    return MathLib.mulDivUp(liquidationPrice, MathLib.WAD, this.price) - MathLib.WAD;
  }

  /**
   * The health factor of the pod's position on the venue (scaled by WAD): the venue's
   * LLTV limit of the collateral's value over the venue debt, the ratio form of
   * `isHealthy`. `MathLib.MAX_UINT_256` when the pod has no venue debt; `undefined` when
   * the price is unknown.
   */
  get healthFactor() {
    if (this.debt === 0n) return MathLib.MAX_UINT_256;

    const collateralValue = PositionUtils.getCollateralValue(
      { collateral: this.collateral },
      { price: this.price },
    );
    if (collateralValue == null) return;

    const maxDebt = MathLib.mulDivDown(collateralValue, this.lltv, MathLib.WAD);

    return MathLib.mulDivDown(maxDebt, MathLib.WAD, this.debt);
  }

  /**
   * Returns a new venue accrued up to the given timestamp: the indices projected with the
   * venue's own rate model, the pod's assets grown with them, and the rate model advanced
   * alongside. A timestamp equal to `lastUpdate` returns an unchanged copy.
   *
   * Accruals assume the venue is untouched in between — exact when it is, an estimate
   * otherwise.
   *
   * @param timestamp - The timestamp to accrue to (in seconds).
   */
  public abstract accrueInterest(timestamp: BigIntish): Venue;

  /**
   * Returns the pod's collateral accrued up to the given timestamp, in collateral token
   * units.
   */
  public abstract getAccrualCollateral(timestamp: BigIntish): bigint;

  /**
   * Returns the pod's debt accrued up to the given timestamp, in debt token units.
   */
  public abstract getAccrualDebt(timestamp: BigIntish): bigint;

  /**
   * Returns the collateral index accrued up to the given timestamp (scaled by RAY).
   */
  public abstract getAccrualCollateralIndex(timestamp: BigIntish): bigint;

  /**
   * Returns the debt index accrued up to the given timestamp (scaled by RAY).
   */
  public abstract getAccrualDebtIndex(timestamp: BigIntish): bigint;

  /**
   * Returns a new venue accrued to the given timestamp with the collateral supplied on
   * top (see `accrueInterest`).
   *
   * @param amount - The collateral amount to supply.
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   */
  public abstract supplyCollateral(amount: bigint, timestamp?: BigIntish): Venue;

  /**
   * Returns a new venue accrued to the given timestamp with the collateral withdrawn,
   * keeping the pod's venue position healthy (see `isHealthy`).
   *
   * @param amount - The collateral amount to withdraw.
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   * @throws {IrisCoreErrors.UnknownVenuePrice} When the venue price is unknown.
   * @throws {IrisCoreErrors.InsufficientVenueCollateral} When the withdrawal would leave
   *   the venue position unhealthy.
   */
  public abstract withdrawCollateral(amount: bigint, timestamp?: BigIntish): Venue;

  /**
   * Returns a new venue accrued to the given timestamp with the debt repaid, both on the
   * live view and on the venue's own primitives, so the repayment survives a later
   * accrual.
   *
   * @param amount - The debt amount to repay.
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   * @throws {IrisCoreErrors.InsufficientVenuePosition} When the repayment exceeds the
   *   pod's debt.
   */
  public abstract repay(amount: bigint, timestamp?: BigIntish): Venue;

  /**
   * Returns a new venue accrued to the given timestamp with the debt borrowed, both on the
   * live view and on the venue's own primitives, so the borrow survives a later accrual.
   *
   * @param amount - The debt amount to borrow.
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   */
  public abstract borrow(amount: bigint, timestamp?: BigIntish): Venue;

  /**
   * Returns the view fields accrued up to the given timestamp via the accrual accessors,
   * advancing `lastUpdate`. Throws when the timestamp is prior to `lastUpdate`.
   */
  protected accruedView(timestamp: BigIntish = this.lastUpdate): IVenue {
    timestamp = BigInt(timestamp);

    if (timestamp < this.lastUpdate) {
      throw new IrisCoreErrors.InvalidInterestAccrual(timestamp, this.lastUpdate);
    }

    return {
      ...this,
      collateral: this.getAccrualCollateral(timestamp),
      debt: this.getAccrualDebt(timestamp),
      collateralIndex: this.getAccrualCollateralIndex(timestamp),
      debtIndex: this.getAccrualDebtIndex(timestamp),
      lastUpdate: timestamp,
    };
  }
}

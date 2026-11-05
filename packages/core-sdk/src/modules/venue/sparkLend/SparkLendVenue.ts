import type { BigIntish } from "../../../types.js";
import type { IVenue, MaxBorrowOptions } from "../Venue.js";

import { IrisCoreErrors } from "../../../errors.js";
import { MathLib } from "../../../math/index.js";
import { VenueName } from "../../../registries.js";
import { ReserveConfigurationLib } from "../aaveV3/ReserveConfigurationLib.js";
import { Venue } from "../Venue.js";
import { SparkLendMath } from "./SparkLendMath.js";

/** Plain input shape for one side of a SparkLend venue: the reserve state a projection needs. */
export interface ISparkLendReserve {
  /** The packed `ReserveConfigurationMap.data` word, decoded by `ReserveConfigurationLib`. */
  configuration: bigint;
  /** The reserve's stored `liquidityIndex` (scaled by RAY). */
  liquidityIndex: bigint;
  /** The reserve's `currentLiquidityRate` (annual, scaled by RAY). */
  currentLiquidityRate: bigint;
  /** The reserve's stored `variableBorrowIndex` (scaled by RAY). */
  variableBorrowIndex: bigint;
  /** The reserve's `currentVariableBorrowRate` (annual, scaled by RAY). */
  currentVariableBorrowRate: bigint;
  /** The reserve's `lastUpdateTimestamp` (in seconds). */
  lastUpdateTimestamp: bigint;
  /** The reserve's `accruedToTreasury` (scaled spToken units). */
  accruedToTreasury: bigint;
}

/**
 * The collateral side's data beyond the reserve itself — the oracle price and the token supplies
 * the supply bound needs, fetched at the same block as the reserves.
 */
export interface ISparkLendCollateralData {
  /** The collateral asset's price from SparkLend's oracle, in base currency units. */
  price: bigint;
  /** The collateral spToken's `scaledTotalSupply`. */
  spTokenScaledTotalSupply: bigint;
  /** The collateral variable debt token's `scaledTotalSupply`. */
  vTokenScaledTotalSupply: bigint;
}

/**
 * The debt side's data beyond the reserve itself — the oracle price, the scaled debt and the
 * liquidity the borrow bound needs, fetched at the same block as the reserves.
 */
export interface ISparkLendDebtData {
  /** The debt asset's price from SparkLend's oracle, in base currency units. */
  price: bigint;
  /** The debt variable debt token's `scaledTotalSupply`. */
  vTokenScaledTotalSupply: bigint;
  /**
   * The debt underlying held by its spToken, in underlying units — the reserve's whole liquidity,
   * since SparkLend has no virtual accounting and a borrow simply transfers it out.
   */
  underlyingBalance: bigint;
}

/**
 * Represents a SparkLend venue: the collateral and debt reserves backing the loan, with
 * SparkLend's interest model used to project the reserve indices.
 *
 * SparkLend is an Aave V3.0 core fork (`sparklend-v1-core`), so this mirrors the Aave V3 venue
 * with the older core's math: half-up token rounding, the binomial borrow-index compounding, and
 * cap checks without virtual accounting (see {@link SparkLendMath}). SparkLend has never enabled
 * stable-rate borrowing, so the stable debt terms of its cap and treasury math are zero and
 * dropped; `fetchSparkLendVenue` refuses a reserve that enables it.
 */
export class SparkLendVenue extends Venue {
  /**
   * The venue's name.
   */
  public readonly name = VenueName.SparkLend;
  /**
   * The collateral asset's reserve state.
   */
  public collateralReserve: ISparkLendReserve;
  /**
   * The debt asset's reserve state.
   */
  public debtReserve: ISparkLendReserve;
  /**
   * The collateral side's data `getMaxSupplyCapacity` and `getMaxBorrowAmount` need,
   * `undefined` when not fetched.
   */
  public collateralData?: ISparkLendCollateralData;
  /**
   * The debt side's data `getMaxBorrowCapacity` and `getMaxBorrowAmount` need, `undefined`
   * when not fetched.
   */
  public debtData?: ISparkLendDebtData;

  constructor(
    venue: IVenue,
    collateralReserve: ISparkLendReserve,
    debtReserve: ISparkLendReserve,
    collateralData?: ISparkLendCollateralData,
    debtData?: ISparkLendDebtData,
  ) {
    super(venue);

    this.collateralReserve = collateralReserve;
    this.debtReserve = debtReserve;
    this.collateralData = collateralData;
    this.debtData = debtData;
  }

  /**
   * The collateral reserve's max LTV (scaled by WAD).
   */
  get ltv() {
    return MathLib.mulDivDown(
      ReserveConfigurationLib.getLtv(this.collateralReserve.configuration),
      MathLib.WAD,
      SparkLendMath.PERCENTAGE_FACTOR,
    );
  }

  /**
   * The venue's current, instantaneous borrow-side Annual Percentage Yield (APY): the debt
   * reserve's `currentVariableBorrowRate` compounded per second over a year, as the Spark app
   * quotes it (scaled by WAD). The rate itself only moves on reserve interactions, so no
   * timestamp projection applies.
   */
  get borrowApy() {
    return SparkLendMath.rateToApy(this.debtReserve.currentVariableBorrowRate);
  }

  /**
   * Returns a new venue accrued up to the given timestamp, accumulating each reserve's interest
   * from its own `lastUpdateTimestamp` with SparkLend's math — linear for the liquidity index,
   * binomially compounded for the variable borrow index. The reserves re-anchor at the accrued
   * indices and timestamp.
   *
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   */
  public accrueInterest(timestamp: BigIntish = this.lastUpdate): SparkLendVenue {
    timestamp = BigInt(timestamp);

    if (timestamp < this.lastUpdate) {
      throw new IrisCoreErrors.InvalidInterestAccrual(timestamp, this.lastUpdate);
    }

    return new SparkLendVenue(
      this.accruedView(timestamp),
      this.accrueCollateralReserve(timestamp),
      this.accrueDebtReserve(timestamp),
      this.collateralData,
      this.debtData,
    );
  }

  /**
   * Returns the pod's spToken balance accrued up to the given timestamp, via SparkLend's
   * half-up scaled-balance round-trip.
   */
  public getAccrualCollateral(timestamp: BigIntish): bigint {
    return SparkLendMath.getSpTokenBalance(
      SparkLendMath.getSpTokenScaledBalance(this.collateral, this.collateralIndex),
      this.getAccrualCollateralIndex(timestamp),
    );
  }

  /**
   * Returns the pod's variable debt accrued up to the given timestamp, via SparkLend's half-up
   * scaled-balance round-trip.
   */
  public getAccrualDebt(timestamp: BigIntish): bigint {
    return SparkLendMath.getVTokenBalance(
      SparkLendMath.getVTokenScaledBalance(this.debt, this.debtIndex),
      this.getAccrualDebtIndex(timestamp),
    );
  }

  /**
   * Returns the liquidity index accrued linearly from the collateral reserve's
   * `lastUpdateTimestamp` (scaled by RAY). Throws on a timestamp prior to it.
   */
  public getAccrualCollateralIndex(timestamp: BigIntish): bigint {
    return this.accrueCollateralReserve(BigInt(timestamp)).liquidityIndex;
  }

  /**
   * Returns the variable borrow index compounded from the debt reserve's `lastUpdateTimestamp`
   * (scaled by RAY). Throws on a timestamp prior to it.
   */
  public getAccrualDebtIndex(timestamp: BigIntish): bigint {
    return this.accrueDebtReserve(BigInt(timestamp)).variableBorrowIndex;
  }

  /**
   * Returns the maximum supply capacity of the collateral reserve (`validateSupply`'s cap check),
   * or `undefined` without `collateralData`.
   */
  public getMaxSupplyCapacity(timestamp: BigIntish = this.lastUpdate) {
    const { collateralData } = this;
    if (collateralData == null) return;

    const { configuration } = this.collateralReserve;
    const { isActive, isFrozen, isPaused } = ReserveConfigurationLib.getFlags(configuration);
    if (!isActive || isFrozen || isPaused) return 0n;

    const supplyCap = ReserveConfigurationLib.getSupplyCap(configuration);
    if (supplyCap === 0n) return MathLib.MAX_UINT_256;

    // The supply validation counts the treasury's pending mint — the re-anchored reserve carries
    // it folded into `accruedToTreasury` (see `accrueReserve`).
    const { liquidityIndex, accruedToTreasury } = this.accrueCollateralReserve(BigInt(timestamp));

    // `(scaledTotalSupply + accruedToTreasury).rayMul(index) + amount <= cap`: the cap bounds
    // the supplied amount itself, with no scaled rounding on top.
    return MathLib.zeroFloorSub(
      supplyCap * 10n ** ReserveConfigurationLib.getDecimals(configuration),
      SparkLendMath.rayMul(
        collateralData.spTokenScaledTotalSupply + accruedToTreasury,
        liquidityIndex,
      ),
    );
  }

  /**
   * Returns the maximum borrow capacity of the debt reserve (`validateBorrow`'s reserve checks
   * and the liquidity its spToken holds), or `undefined` without `debtData`.
   */
  public getMaxBorrowCapacity(timestamp: BigIntish = this.lastUpdate) {
    const { debtData } = this;
    if (debtData == null) return;

    const { configuration } = this.debtReserve;
    const { isActive, isFrozen, borrowingEnabled, isPaused } =
      ReserveConfigurationLib.getFlags(configuration);
    if (!isActive || isFrozen || !borrowingEnabled || isPaused) return 0n;

    // A borrow transfers the underlying out of the spToken, so its balance bounds the amount.
    const liquidity = debtData.underlyingBalance;

    const borrowCap = ReserveConfigurationLib.getBorrowCap(configuration);
    if (borrowCap === 0n) return liquidity;

    // `currTotalStableDebt + totalSupplyVariableDebt + amount <= borrowCap * assetUnit`, with no
    // stable debt on SparkLend.
    const { variableBorrowIndex } = this.accrueDebtReserve(BigInt(timestamp));
    const totalSupplyVariableDebt = SparkLendMath.rayMul(
      debtData.vTokenScaledTotalSupply,
      variableBorrowIndex,
    );

    return MathLib.min(
      liquidity,
      MathLib.zeroFloorSub(
        borrowCap * 10n ** ReserveConfigurationLib.getDecimals(configuration),
        totalSupplyVariableDebt,
      ),
    );
  }

  /**
   * Returns the maximum borrow amount against the given collateral, measured at `maxLtv` and
   * bounded by `getMaxBorrowCapacity`. `maxLtv` (scaled by WAD) defaults to — and is capped by —
   * the venue's max borrow LTV, so a caller can tighten the limit but never exceed the venue's
   * own.
   *
   * At the venue's own LTV the bound is `validateBorrow`'s, exactly, for a pod holding nothing
   * else: the debt valued in base currency (floored), divided by the LTV with SparkLend's half-up
   * `percentDiv`, must not exceed the collateral's floored base value. A tighter `maxLtv` bounds
   * that floored debt value by the collateral value at `maxLtv` instead.
   *
   * Iris pods never enter eMode, and the bound leaves out isolation mode, siloed borrowing and
   * debt ceilings: it is exact only while the collateral reserve has no debt ceiling and the debt
   * reserve is not siloed.
   */
  public getMaxBorrowAmount(
    collateral: bigint,
    { maxLtv = this.ltv, timestamp = this.lastUpdate }: MaxBorrowOptions = {},
  ) {
    const { collateralData, debtData } = this;
    if (collateralData == null || debtData == null) return;

    const venueLtv = this.ltv;
    const effectiveLtv = MathLib.min(maxLtv, venueLtv);
    if (collateral === 0n || effectiveLtv === 0n) return 0n;

    // The supply mints `rayDiv(amount, index)` scaled, then reads back at the same index, both
    // rounded half up; a zero mint reverts.
    const liquidityIndex = this.getAccrualCollateralIndex(timestamp);
    const scaledCollateral = SparkLendMath.getScaledAmount(collateral, liquidityIndex);
    if (scaledCollateral === 0n) return 0n;

    const collateralBase = MathLib.mulDivDown(
      SparkLendMath.getSpTokenBalance(scaledCollateral, liquidityIndex),
      collateralData.price,
      10n ** ReserveConfigurationLib.getDecimals(this.collateralReserve.configuration),
    );
    // `validateBorrow` rejects a zero collateral value before any LTV math.
    if (collateralBase === 0n) return 0n;

    // The largest debt value, in base currency, the LTV check admits. At the venue's own LTV,
    // `validateBorrow` checks `percentDiv(debtBase, ltv) <= collateralBase`, whose half-up rounding
    // admits at most one base unit above the floored bound, so a single probe settles it.
    let maxDebtBase = MathLib.mulDivDown(collateralBase, effectiveLtv, MathLib.WAD);
    if (
      effectiveLtv === venueLtv &&
      SparkLendMath.percentDiv(
        maxDebtBase + 1n,
        ReserveConfigurationLib.getLtv(this.collateralReserve.configuration),
      ) <= collateralBase
    ) {
      maxDebtBase += 1n;
    }

    // The largest amount whose floored base value stays within that bound.
    const maxDebt =
      MathLib.mulDivUp(
        maxDebtBase + 1n,
        10n ** ReserveConfigurationLib.getDecimals(this.debtReserve.configuration),
        debtData.price,
      ) - 1n;

    const capacity = this.getMaxBorrowCapacity(timestamp);
    if (capacity == null) return;

    return MathLib.min(maxDebt, capacity);
  }

  /**
   * Returns a new venue accrued to the given timestamp with the collateral supplied on top.
   * Supplies don't refresh the reserve rates, so repeated operations drift further from onchain
   * results.
   *
   * @param amount - The collateral amount to supply.
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   */
  public supplyCollateral(amount: bigint, timestamp?: BigIntish): SparkLendVenue {
    const venue = this.accrueInterest(timestamp);

    venue.collateral += amount;

    return venue;
  }

  /**
   * Returns a new venue accrued to the given timestamp with the collateral withdrawn, keeping the
   * pod's venue position healthy (see `Venue.isHealthy`). Withdrawals don't refresh the reserve
   * rates, so repeated operations drift further from onchain results.
   *
   * @param amount - The collateral amount to withdraw.
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   * @throws {IrisCoreErrors.UnknownVenuePrice} When the venue price is unknown.
   * @throws {IrisCoreErrors.InsufficientVenueCollateral} When the withdrawal would leave the
   *   venue position unhealthy.
   */
  public withdrawCollateral(amount: bigint, timestamp?: BigIntish): SparkLendVenue {
    if (this.price == null) throw new IrisCoreErrors.UnknownVenuePrice(this.pod, this.id);

    const venue = this.accrueInterest(timestamp);

    venue.collateral -= amount;

    if (venue.collateral < 0n || !venue.isHealthy) {
      throw new IrisCoreErrors.InsufficientVenueCollateral(venue.pod, venue.id);
    }

    return venue;
  }

  /**
   * Returns a new venue accrued to the given timestamp with the debt repaid. Repayments don't
   * refresh the reserve rates, so repeated operations drift further from onchain results.
   *
   * @param amount - The debt amount to repay.
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   * @throws {IrisCoreErrors.InsufficientVenuePosition} When the repayment exceeds the pod's
   *   debt.
   */
  public repay(amount: bigint, timestamp?: BigIntish): SparkLendVenue {
    const venue = this.accrueInterest(timestamp);

    // The scaled debt is re-derived from the balance on every accrual, so cutting the balance is
    // the whole repayment.
    venue.debt -= amount;

    if (venue.debt < 0n) {
      throw new IrisCoreErrors.InsufficientVenuePosition(venue.pod, venue.id);
    }

    return venue;
  }

  /**
   * Returns a new venue accrued to the given timestamp with the debt borrowed. Borrows don't
   * refresh the reserve rates, so repeated operations drift further from onchain results.
   *
   * @param amount - The debt amount to borrow.
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   */
  public borrow(amount: bigint, timestamp?: BigIntish): SparkLendVenue {
    const venue = this.accrueInterest(timestamp);

    venue.debt += amount;

    return venue;
  }

  /**
   * Returns the reserve re-anchored at the given timestamp, as SparkLend's `updateState` would:
   * the liquidity index accrued linearly, the variable borrow index binomially compounded — held
   * still when the given vToken scaled supply is zero, as `_updateIndexes` only advances it while
   * variable debt exists — and the treasury's pending mint (`_accrueToTreasury`) folded into
   * `accruedToTreasury` when the scaled supply is given. The timestamp must not be prior to the
   * reserve's `lastUpdateTimestamp`.
   */
  protected accrueReserve(
    reserve: ISparkLendReserve,
    timestamp: bigint,
    vTokenScaledTotalSupply?: bigint,
  ): ISparkLendReserve {
    const elapsed = timestamp - reserve.lastUpdateTimestamp;

    const liquidityIndex = SparkLendMath.rayMul(
      SparkLendMath.getLinearInterest(reserve.currentLiquidityRate, elapsed),
      reserve.liquidityIndex,
    );
    const variableBorrowIndex =
      vTokenScaledTotalSupply === 0n
        ? reserve.variableBorrowIndex
        : SparkLendMath.rayMul(
            SparkLendMath.getCompoundedInterest(reserve.currentVariableBorrowRate, elapsed),
            reserve.variableBorrowIndex,
          );

    let accruedToTreasury = reserve.accruedToTreasury;
    const reserveFactor = ReserveConfigurationLib.getReserveFactor(reserve.configuration);
    if (reserveFactor !== 0n && vTokenScaledTotalSupply != null) {
      // The debt accrued is the scaled debt read at both indices, each read rounded half up.
      const prevTotalVariableDebt = SparkLendMath.rayMul(
        vTokenScaledTotalSupply,
        reserve.variableBorrowIndex,
      );
      const currTotalVariableDebt = SparkLendMath.rayMul(
        vTokenScaledTotalSupply,
        variableBorrowIndex,
      );
      const totalDebtAccrued = currTotalVariableDebt - prevTotalVariableDebt;
      const amountToMint = SparkLendMath.percentMul(totalDebtAccrued, reserveFactor);

      if (amountToMint !== 0n) {
        accruedToTreasury += SparkLendMath.rayDiv(amountToMint, liquidityIndex);
      }
    }

    return {
      ...reserve,
      liquidityIndex,
      variableBorrowIndex,
      accruedToTreasury,
      lastUpdateTimestamp: timestamp,
    };
  }

  /**
   * Returns the collateral reserve re-anchored at the given timestamp (see `accrueReserve`).
   * Throws on a timestamp prior to the reserve's `lastUpdateTimestamp`.
   */
  protected accrueCollateralReserve(timestamp: bigint): ISparkLendReserve {
    const { collateralReserve } = this;

    if (timestamp < collateralReserve.lastUpdateTimestamp) {
      throw new IrisCoreErrors.InvalidVenueInterestAccrual(
        "collateral",
        timestamp,
        collateralReserve.lastUpdateTimestamp,
      );
    }

    return this.accrueReserve(
      collateralReserve,
      timestamp,
      this.collateralData?.vTokenScaledTotalSupply,
    );
  }

  /**
   * Returns the debt reserve re-anchored at the given timestamp (see `accrueReserve`). Throws on
   * a timestamp prior to the reserve's `lastUpdateTimestamp`.
   */
  protected accrueDebtReserve(timestamp: bigint): ISparkLendReserve {
    const { debtReserve } = this;

    if (timestamp < debtReserve.lastUpdateTimestamp) {
      throw new IrisCoreErrors.InvalidVenueInterestAccrual(
        "debt",
        timestamp,
        debtReserve.lastUpdateTimestamp,
      );
    }

    return this.accrueReserve(debtReserve, timestamp, this.debtData?.vTokenScaledTotalSupply);
  }
}

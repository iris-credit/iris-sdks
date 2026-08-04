import type { BigIntish } from "../../../types.js";
import type { IVenue } from "../Venue.js";

import { IrisCoreErrors } from "../../../errors.js";
import { MathLib } from "../../../math/index.js";
import { VenueName } from "../../../registries.js";
import { Venue } from "../Venue.js";
import { AaveV3Math } from "./AaveV3Math.js";
import { ReserveConfigurationLib } from "./ReserveConfigurationLib.js";

/** Plain input shape for one side of an Aave V3 venue: the reserve state a projection needs. */
export interface IAaveReserve {
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
  /** The reserve's `accruedToTreasury` (scaled aToken units). */
  accruedToTreasury: bigint;
}

/**
 * The collateral side's data beyond the reserve itself — the oracle price and the token
 * supplies the supply bound needs, fetched at the same block as the reserves.
 */
export interface IAaveCollateralData {
  /** The collateral asset's price from Aave's oracle, in base currency units. */
  price: bigint;
  /** The collateral aToken's `scaledTotalSupply`. */
  aTokenScaledTotalSupply: bigint;
  /** The collateral variable debt token's `scaledTotalSupply`. */
  vTokenScaledTotalSupply: bigint;
}

/**
 * The debt side's data beyond the reserve itself — the oracle price and the
 * supply/liquidity values the borrow bound needs, fetched at the same block as the
 * reserves.
 */
export interface IAaveDebtData {
  /** The debt asset's price from Aave's oracle, in base currency units. */
  price: bigint;
  /** The debt aToken's `scaledTotalSupply`. */
  aTokenScaledTotalSupply: bigint;
  /** The debt variable debt token's `scaledTotalSupply`. */
  vTokenScaledTotalSupply: bigint;
  /** The debt underlying held by its aToken, in underlying units. */
  underlyingBalance: bigint;
  /** The pool's `getVirtualUnderlyingBalance` for the debt reserve, in underlying units. */
  virtualUnderlyingBalance: bigint;
}

/**
 * Represents an Aave V3 venue: the collateral and debt reserves backing the loan, with Aave's
 * interest model used to project the reserve indices.
 */
export class AaveV3Venue extends Venue {
  /**
   * The venue's name.
   */
  public readonly name = VenueName.AaveV3;
  /**
   * The collateral asset's reserve state.
   */
  public collateralReserve: IAaveReserve;
  /**
   * The debt asset's reserve state.
   */
  public debtReserve: IAaveReserve;
  /**
   * The collateral side's data `getMaxSupplyCapacity` and `getMaxBorrowAmount` need,
   * `undefined` when not fetched.
   */
  public collateralData?: IAaveCollateralData;
  /**
   * The debt side's data `getMaxBorrowCapacity` and `getMaxBorrowAmount` need,
   * `undefined` when not fetched.
   */
  public debtData?: IAaveDebtData;

  constructor(
    venue: IVenue,
    collateralReserve: IAaveReserve,
    debtReserve: IAaveReserve,
    collateralData?: IAaveCollateralData,
    debtData?: IAaveDebtData,
  ) {
    super(venue);

    this.collateralReserve = collateralReserve;
    this.debtReserve = debtReserve;
    this.collateralData = collateralData;
    this.debtData = debtData;
  }

  /**
   * Returns a new venue accrued up to the given timestamp, accumulating each reserve's
   * interest from its own `lastUpdateTimestamp` with Aave's math — linear for the
   * liquidity index, compounded for the variable borrow index. The reserves re-anchor at
   * the accrued indices and timestamp.
   *
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   */
  public accrueInterest(timestamp: BigIntish = this.lastUpdate): AaveV3Venue {
    timestamp = BigInt(timestamp);

    if (timestamp < this.lastUpdate) {
      throw new IrisCoreErrors.InvalidInterestAccrual(timestamp, this.lastUpdate);
    }

    return new AaveV3Venue(
      this.accruedView(timestamp),
      this.accrueCollateralReserve(timestamp),
      this.accrueDebtReserve(timestamp),
      this.collateralData,
      this.debtData,
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
    return this.accrueCollateralReserve(BigInt(timestamp)).liquidityIndex;
  }

  /**
   * Returns the variable borrow index compounded from the debt reserve's
   * `lastUpdateTimestamp` (scaled by RAY). Throws on a timestamp prior to it.
   */
  public getAccrualDebtIndex(timestamp: BigIntish): bigint {
    return this.accrueDebtReserve(BigInt(timestamp)).variableBorrowIndex;
  }

  /**
   * Returns the maximum supply capacity of the collateral reserve (`validateSupply`'s
   * cap check), or `undefined` without `collateralData`.
   */
  public getMaxSupplyCapacity(timestamp: BigIntish = this.lastUpdate) {
    const { collateralData } = this;
    if (collateralData == null) return;

    const { configuration } = this.collateralReserve;
    const { isActive, isFrozen, isPaused } = ReserveConfigurationLib.getFlags(configuration);
    if (!isActive || isFrozen || isPaused) return 0n;

    const supplyCap = ReserveConfigurationLib.getSupplyCap(configuration);
    if (supplyCap === 0n) return MathLib.MAX_UINT_256;

    // Aave's supply validation counts the treasury's pending mint — the re-anchored
    // reserve carries it folded into `accruedToTreasury` (see `accrueReserve`).
    const { liquidityIndex, accruedToTreasury } = this.accrueCollateralReserve(BigInt(timestamp));

    const supplyCapWithDecimals =
      supplyCap * 10n ** ReserveConfigurationLib.getDecimals(configuration);
    // The largest scaled supply whose floor-rounded balance stays within the cap...
    const totalScaledSupply =
      MathLib.mulDivUp(supplyCapWithDecimals + 1n, MathLib.RAY, liquidityIndex) - 1n;
    const currentScaledSupply = collateralData.aTokenScaledTotalSupply + accruedToTreasury;
    if (totalScaledSupply <= currentScaledSupply) return 0n;

    // ...and the largest supply whose floor-scaled mint stays within that headroom.
    return (
      MathLib.mulDivUp(totalScaledSupply - currentScaledSupply + 1n, liquidityIndex, MathLib.RAY) -
      1n
    );
  }

  /**
   * Returns the maximum borrow capacity of the debt reserve (`validateBorrow`'s reserve
   * checks), or `undefined` without `debtData`.
   */
  public getMaxBorrowCapacity(timestamp: BigIntish = this.lastUpdate) {
    const { debtData } = this;
    if (debtData == null) return;

    const { configuration } = this.debtReserve;
    const { isActive, isFrozen, borrowingEnabled, isPaused } =
      ReserveConfigurationLib.getFlags(configuration);
    if (!isActive || isFrozen || !borrowingEnabled || isPaused) return 0n;

    const {
      aTokenScaledTotalSupply,
      vTokenScaledTotalSupply,
      underlyingBalance,
      virtualUnderlyingBalance,
    } = debtData;

    const { liquidityIndex, variableBorrowIndex: debtIndex } = this.accrueDebtReserve(
      BigInt(timestamp),
    );
    const liquidity = MathLib.min(underlyingBalance, virtualUnderlyingBalance);
    // `validateBorrow` reads the aToken supply back at the borrow-time liquidity index.
    const aTokenTotalSupply = AaveV3Math.getATokenBalance(aTokenScaledTotalSupply, liquidityIndex);
    // The borrow's ceil round-trip must stay within the aToken total supply.
    let maxBorrow = MathLib.min(
      liquidity,
      MathLib.mulDivDown(
        MathLib.mulDivDown(aTokenTotalSupply, MathLib.RAY, debtIndex),
        debtIndex,
        MathLib.RAY,
      ),
    );

    const borrowCap = ReserveConfigurationLib.getBorrowCap(configuration);
    if (borrowCap !== 0n) {
      const borrowCapWithDecimals =
        borrowCap * 10n ** ReserveConfigurationLib.getDecimals(configuration);
      // The largest scaled debt whose ceil-rounded balance stays within the cap.
      const maxTotalScaledDebt = MathLib.mulDivDown(borrowCapWithDecimals, MathLib.RAY, debtIndex);
      if (maxTotalScaledDebt <= vTokenScaledTotalSupply) return 0n;

      maxBorrow = MathLib.min(
        maxBorrow,
        MathLib.mulDivDown(maxTotalScaledDebt - vTokenScaledTotalSupply, debtIndex, MathLib.RAY),
      );
    }

    return maxBorrow;
  }

  /**
   * Returns the maximum borrow amount against the given collateral, bounded by `getMaxBorrowCapacity`.
   */
  public getMaxBorrowAmount(collateral: bigint, timestamp: BigIntish = this.lastUpdate) {
    const { collateralData, debtData } = this;
    if (collateralData == null || debtData == null) return;

    const { configuration } = this.collateralReserve;
    const ltv = ReserveConfigurationLib.getLtv(configuration);
    if (collateral === 0n || ltv === 0n) return 0n;

    // Account for Aave's two floor roundings: supply amount to aToken shares, then
    // shares to balance.
    const liquidityIndex = this.getAccrualCollateralIndex(timestamp);
    const scaledCollateral = AaveV3Math.getATokenMintScaledAmount(collateral, liquidityIndex);
    if (scaledCollateral === 0n) return 0n;

    const collateralBalance = AaveV3Math.getATokenBalance(scaledCollateral, liquidityIndex);
    const collateralBase = MathLib.mulDivDown(
      collateralBalance,
      collateralData.price,
      10n ** ReserveConfigurationLib.getDecimals(configuration),
    );
    const maxDebtBase = MathLib.mulDivDown(collateralBase, ltv, AaveV3Math.PERCENTAGE_FACTOR);
    const maxActualDebt = MathLib.mulDivDown(
      maxDebtBase,
      10n ** ReserveConfigurationLib.getDecimals(this.debtReserve.configuration),
      debtData.price,
    );

    const capacity = this.getMaxBorrowCapacity(timestamp);
    if (capacity == null) return;

    // Account for Aave's two ceil roundings: borrow amount to vToken shares, then
    // shares to debt.
    const debtIndex = this.getAccrualDebtIndex(timestamp);
    return MathLib.min(
      MathLib.mulDivDown(
        MathLib.mulDivDown(maxActualDebt, MathLib.RAY, debtIndex),
        debtIndex,
        MathLib.RAY,
      ),
      capacity,
    );
  }

  /**
   * Returns a new venue accrued to the given timestamp with the collateral supplied on
   * top. Supplies don't refresh the reserve rates, so repeated operations drift further
   * from onchain results.
   *
   * @param amount - The collateral amount to supply.
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   */
  public supplyCollateral(amount: bigint, timestamp?: BigIntish): AaveV3Venue {
    const venue = this.accrueInterest(timestamp);

    venue.collateral += amount;

    return venue;
  }

  /**
   * Returns a new venue accrued to the given timestamp with the collateral withdrawn,
   * keeping the pod's venue position healthy (see `Venue.isHealthy`). Withdrawals don't
   * refresh the reserve rates, so repeated operations drift further from onchain results.
   *
   * @param amount - The collateral amount to withdraw.
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   * @throws {IrisCoreErrors.UnknownVenuePrice} When the venue price is unknown.
   * @throws {IrisCoreErrors.InsufficientVenueCollateral} When the withdrawal would leave
   *   the venue position unhealthy.
   */
  public withdrawCollateral(amount: bigint, timestamp?: BigIntish): AaveV3Venue {
    if (this.price == null) throw new IrisCoreErrors.UnknownVenuePrice(this.pod, this.id);

    const venue = this.accrueInterest(timestamp);

    venue.collateral -= amount;

    if (venue.collateral < 0n || !venue.isHealthy) {
      throw new IrisCoreErrors.InsufficientVenueCollateral(venue.pod, venue.id);
    }

    return venue;
  }

  /**
   * Returns a new venue accrued to the given timestamp with the debt repaid. Repayments
   * don't refresh the reserve rates, so repeated operations drift further from onchain
   * results.
   *
   * @param amount - The debt amount to repay.
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   * @throws {IrisCoreErrors.InsufficientVenuePosition} When the repayment exceeds the
   *   pod's debt.
   */
  public repay(amount: bigint, timestamp?: BigIntish): AaveV3Venue {
    const venue = this.accrueInterest(timestamp);

    // The scaled debt is re-derived from the balance on every accrual, so cutting the
    // balance is the whole repayment.
    venue.debt -= amount;

    if (venue.debt < 0n) {
      throw new IrisCoreErrors.InsufficientVenuePosition(venue.pod, venue.id);
    }

    return venue;
  }

  /**
   * Returns a new venue accrued to the given timestamp with the debt borrowed. Borrows
   * don't refresh the reserve rates, so repeated operations drift further from onchain
   * results.
   *
   * @param amount - The debt amount to borrow.
   * @param timestamp - The timestamp to accrue to (in seconds). Defaults to `lastUpdate`.
   */
  public borrow(amount: bigint, timestamp?: BigIntish): AaveV3Venue {
    const venue = this.accrueInterest(timestamp);

    venue.debt += amount;

    return venue;
  }

  /**
   * Returns the reserve re-anchored at the given timestamp, as Aave's `updateState` would:
   * the liquidity index accrued linearly, the variable borrow index compounded — held
   * still when the given vToken scaled supply is zero, as `_updateIndexes` only
   * advances it while variable debt exists — and the treasury's pending mint
   * (`_accrueToTreasury`) folded into `accruedToTreasury` when the scaled supply is
   * given. The timestamp must not be prior to the reserve's `lastUpdateTimestamp`.
   */
  protected accrueReserve(
    reserve: IAaveReserve,
    timestamp: bigint,
    vTokenScaledTotalSupply?: bigint,
  ): IAaveReserve {
    const elapsed = timestamp - reserve.lastUpdateTimestamp;

    const liquidityIndex = AaveV3Math.rayMul(
      AaveV3Math.getLinearInterest(reserve.currentLiquidityRate, elapsed),
      reserve.liquidityIndex,
    );
    const variableBorrowIndex =
      vTokenScaledTotalSupply === 0n
        ? reserve.variableBorrowIndex
        : AaveV3Math.rayMul(
            AaveV3Math.getCompoundedInterest(reserve.currentVariableBorrowRate, elapsed),
            reserve.variableBorrowIndex,
          );

    let accruedToTreasury = reserve.accruedToTreasury;
    const reserveFactor = ReserveConfigurationLib.getReserveFactor(reserve.configuration);
    if (reserveFactor !== 0n && vTokenScaledTotalSupply != null) {
      const totalDebtAccrued = MathLib.mulDivDown(
        vTokenScaledTotalSupply,
        variableBorrowIndex - reserve.variableBorrowIndex,
        MathLib.RAY,
      );
      const amountToMint = AaveV3Math.percentMul(totalDebtAccrued, reserveFactor);

      if (amountToMint !== 0n) {
        accruedToTreasury += AaveV3Math.getATokenMintScaledAmount(amountToMint, liquidityIndex);
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
   * Returns the collateral reserve re-anchored at the given timestamp (see
   * `accrueReserve`). Throws on a timestamp prior to the reserve's
   * `lastUpdateTimestamp`.
   */
  protected accrueCollateralReserve(timestamp: bigint): IAaveReserve {
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
   * Returns the debt reserve re-anchored at the given timestamp (see `accrueReserve`).
   * Throws on a timestamp prior to the reserve's `lastUpdateTimestamp`.
   */
  protected accrueDebtReserve(timestamp: bigint): IAaveReserve {
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

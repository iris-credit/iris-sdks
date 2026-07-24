import type { BigIntish } from "../../types.js";

import { ORACLE_PRICE_SCALE, SECONDS_PER_YEAR } from "../../constants.js";
import { MathLib } from "../../math/index.js";
import { LoanUtils } from "../loan/LoanUtils.js";

/**
 * Namespace of utility functions to ease position-related calculations.
 *
 * @dev Functions normalize BigIntish fields of input objects in place (obj.x = BigInt(obj.x)).
 * This is deliberate (BigIntish values are bigint-representable by contract and BigInt() is idempotent)
 * so callers may observe normalized (value-identical) fields. This is by design, not a mutation bug.
 */
export namespace PositionUtils {
  /**
   * Returns the new venue indices and the interest accrued on each leg of the given position
   * since its last update, matching Iris's onchain accrual.
   *
   * Legs are returned as increments to add to the stored legs. When the position was never
   * updated or no time has elapsed, the stored indices are returned with zero increments.
   *
   * @param position.collateral The position's collateral before accrual.
   * @param position.debt The position's debt (principal).
   * @param position.bondRequirement The position's bond requirement (zero once the loan is closed, which skips the surplus accrual).
   * @param position.collateralIndex The venue's collateral index at the last update (scaled by RAY).
   * @param position.debtIndex The venue's debt index at the last update (scaled by RAY).
   * @param position.floatingLeg The position's floating leg before accrual.
   * @param position.surplus The position's surplus before accrual.
   * @param position.lastUpdate The timestamp of the last accrual (in seconds).
   * @param loan.maturity The loan's maturity timestamp (in seconds).
   * @param loan.fixedRate The loan's annual fixed rate (scaled by WAD).
   * @param loan.overdueRate The loan's annual overdue rate, added on top of the fixed rate past maturity (scaled by WAD).
   * @param venue.collateralIndex The venue's current collateral index, from `IVenueAdapter.indices` (scaled by WAD).
   * @param venue.debtIndex The venue's current debt index, from `IVenueAdapter.indices` (scaled by WAD).
   * @param timestamp The timestamp at which to accrue interest (in seconds).
   * @returns The new venue indices (scaled by RAY) and the `fixedLeg`, `floatingLeg` & `surplus` increments.
   * @example
   * ```ts
   * import { MathLib, PositionUtils } from "@iris-credit/core-sdk";
   *
   * const { fixedLeg } = PositionUtils.getAccruedLegs(
   *   {
   *     collateral: 0n,
   *     debt: MathLib.WAD,
   *     bondRequirement: 0n,
   *     collateralIndex: MathLib.WAD,
   *     debtIndex: MathLib.WAD,
   *     floatingLeg: 0n,
   *     surplus: 0n,
   *     lastUpdate: 1_000n,
   *   },
   *   { maturity: 40_000_000n, fixedRate: 10_0000000000000000n, overdueRate: 20_0000000000000000n },
   *   { collateralIndex: MathLib.WAD, debtIndex: MathLib.WAD },
   *   1_000n + 31_536_000n,
   * );
   * // fixedLeg === 100000000000000000n
   * ```
   */
  export const getAccruedLegs = (
    position: {
      collateral: BigIntish;
      debt: BigIntish;
      bondRequirement: BigIntish;
      collateralIndex: BigIntish;
      debtIndex: BigIntish;
      floatingLeg: BigIntish;
      surplus: BigIntish;
      lastUpdate: BigIntish;
    },
    loan: { maturity: BigIntish; fixedRate: BigIntish; overdueRate: BigIntish },
    { collateralIndex, debtIndex }: { collateralIndex: BigIntish; debtIndex: BigIntish },
    timestamp: BigIntish,
  ) => {
    position.collateral = BigInt(position.collateral);
    position.debt = BigInt(position.debt);
    position.bondRequirement = BigInt(position.bondRequirement);
    position.collateralIndex = BigInt(position.collateralIndex);
    position.debtIndex = BigInt(position.debtIndex);
    position.floatingLeg = BigInt(position.floatingLeg);
    position.surplus = BigInt(position.surplus);
    position.lastUpdate = BigInt(position.lastUpdate);
    loan.maturity = BigInt(loan.maturity);
    loan.fixedRate = BigInt(loan.fixedRate);
    loan.overdueRate = BigInt(loan.overdueRate);
    collateralIndex = BigInt(collateralIndex);
    debtIndex = BigInt(debtIndex);
    timestamp = BigInt(timestamp);

    const elapsed = timestamp - position.lastUpdate;
    if (position.lastUpdate === 0n || elapsed === 0n) {
      return {
        collateralIndex: position.collateralIndex,
        debtIndex: position.debtIndex,
        fixedLeg: 0n,
        floatingLeg: 0n,
        surplus: 0n,
      };
    }

    let fixedLeg = MathLib.mulDivDown(
      position.debt,
      elapsed * loan.fixedRate,
      SECONDS_PER_YEAR * MathLib.WAD,
    );
    const floatingLeg = MathLib.mulDivDown(
      position.debt + position.floatingLeg,
      debtIndex - position.debtIndex,
      position.debtIndex,
    );
    const surplus =
      position.bondRequirement !== 0n
        ? MathLib.mulDivDown(
            position.collateral + position.surplus,
            collateralIndex - position.collateralIndex,
            position.collateralIndex,
          )
        : 0n;

    if (timestamp > loan.maturity) {
      const overdueStart = MathLib.max(loan.maturity, position.lastUpdate);
      fixedLeg += MathLib.mulDivDown(
        position.debt,
        (timestamp - overdueStart) * loan.overdueRate,
        SECONDS_PER_YEAR * MathLib.WAD,
      );
    }

    return {
      collateralIndex,
      debtIndex,
      fixedLeg,
      floatingLeg,
      surplus,
    };
  };

  /**
   * Mirror of Iris's `_rebase`: detects venue-side liquidations or repayments on the pod's
   * venue position and returns the rebased position fields.
   *
   * `liquidated` collateral (tracked collateral + surplus above the venue's actual) and
   * `repaid` debt (tracked debt + floating leg above the venue's actual) are derived from
   * the venue's view; when either is zero, the position is returned unchanged. Otherwise
   * the tracked collateral is reduced by the liquidated amount and the tracked debt by the
   * repaid amount, capped at the liquidated amount's value in debt assets. The surplus and
   * floating leg are clamped to the venue's actuals, and the bond requirement is zeroed
   * (resolving the loan) on bad debt or when the venue position is emptied.
   *
   * Expects accrued legs: apply the `getAccruedLegs` increments beforehand, as the rebase
   * runs after accrual onchain (and before every other state change).
   *
   * @param position.collateral The position's collateral.
   * @param position.debt The position's debt (principal).
   * @param position.bondRequirement The position's bond requirement (zero once the loan is closed).
   * @param position.floatingLeg The position's floating leg.
   * @param position.surplus The position's surplus.
   * @param venue.collateral The pod's collateral on the venue, from `IVenueAdapter.positionAssets`.
   * @param venue.debt The pod's debt on the venue, from `IVenueAdapter.positionAssets`.
   * @param venue.price The collateral price quoted in debt assets, from `IVenueAdapter.price` (scaled by ORACLE_PRICE_SCALE), or `undefined` when unknown.
   * @returns The rebased `collateral`, `debt`, `bondRequirement`, `floatingLeg` & `surplus`
   * (the bond, fixed leg and indices are unaffected), or `undefined` when a rebase is
   * needed but the price is unknown.
   * @example
   * ```ts
   * import { MathLib, ORACLE_PRICE_SCALE, PositionUtils } from "@iris-credit/core-sdk";
   *
   * const rebased = PositionUtils.getRebasedPosition(
   *   {
   *     collateral: 10n * MathLib.WAD,
   *     debt: 5n * MathLib.WAD,
   *     bondRequirement: 1n,
   *     floatingLeg: 0n,
   *     surplus: 0n,
   *   },
   *   { collateral: 4n * MathLib.WAD, debt: 2n * MathLib.WAD, price: ORACLE_PRICE_SCALE },
   * );
   * // rebased.collateral === 4000000000000000000n
   * // rebased.debt === 2000000000000000000n
   * ```
   */
  export const getRebasedPosition = (
    position: {
      collateral: BigIntish;
      debt: BigIntish;
      bondRequirement: BigIntish;
      floatingLeg: BigIntish;
      surplus: BigIntish;
    },
    venue: { collateral: BigIntish; debt: BigIntish; price?: BigIntish },
  ) => {
    position.collateral = BigInt(position.collateral);
    position.debt = BigInt(position.debt);
    position.bondRequirement = BigInt(position.bondRequirement);
    position.floatingLeg = BigInt(position.floatingLeg);
    position.surplus = BigInt(position.surplus);
    venue.collateral = BigInt(venue.collateral);
    venue.debt = BigInt(venue.debt);

    const liquidated = MathLib.zeroFloorSub(
      position.collateral + position.surplus,
      venue.collateral,
    );
    const repaid = MathLib.zeroFloorSub(position.debt + position.floatingLeg, venue.debt);

    if (liquidated === 0n || repaid === 0n) {
      return {
        collateral: position.collateral,
        debt: position.debt,
        bondRequirement: position.bondRequirement,
        floatingLeg: position.floatingLeg,
        surplus: position.surplus,
      };
    }

    if (venue.price == null) return;

    const maxRepaid = MathLib.mulDivDown(liquidated, venue.price, ORACLE_PRICE_SCALE);
    const badDebt = MathLib.zeroFloorSub(
      venue.debt,
      getCollateralValue({ collateral: venue.collateral }, { price: venue.price })!,
    );

    return {
      collateral: MathLib.zeroFloorSub(position.collateral, liquidated),
      debt: MathLib.zeroFloorSub(position.debt, MathLib.min(repaid, maxRepaid)),
      bondRequirement:
        badDebt !== 0n || (venue.debt === 0n && venue.collateral === 0n)
          ? 0n
          : position.bondRequirement,
      floatingLeg: MathLib.min(position.floatingLeg, venue.debt),
      surplus: MathLib.min(position.surplus, venue.collateral),
    };
  };

  /**
   * Mirror of Iris's `_settleLegs`: returns the solver's net and the protocol fee cuts
   * credited when a loan is settled (on `repay` and `liquidate`; bond liquidation does not
   * settle).
   *
   * The net is measured on the settled fixed leg: before maturity, the residual fixed
   * interest until maturity is first credited to the fixed leg (early settlement), so the
   * settled fixed leg is `position.fixedLeg + getResidual(position, loan, timestamp)`.
   * Onchain, the solver is then credited `net - performanceFee` in debt token and
   * `surplus - surplusFee` in collateral token as claimable, and the fee recipient the two
   * fee cuts.
   *
   * Expects accrued legs: apply the `getAccruedLegs` increments beforehand, as settlement
   * runs after accrual onchain.
   *
   * @param position.debt The position's debt (principal).
   * @param position.fixedLeg The position's fixed leg.
   * @param position.floatingLeg The position's floating leg.
   * @param position.surplus The position's surplus.
   * @param loan.maturity The loan's maturity timestamp (in seconds).
   * @param loan.fixedRate The loan's annual fixed rate (scaled by WAD).
   * @param loan.fee The loan's protocol fee, snapshotted from Iris config at `take` (scaled by WAD).
   * @param timestamp The settlement timestamp (in seconds).
   * @returns The `net` (settled fixed leg over floating leg, zero-floored) and the
   * protocol's `performanceFee` & `surplusFee` cuts.
   * @example
   * ```ts
   * import { MathLib, PositionUtils } from "@iris-credit/core-sdk";
   *
   * const { net, performanceFee } = PositionUtils.getSettlement(
   *   { debt: MathLib.WAD, fixedLeg: 0n, floatingLeg: 0n, surplus: 0n },
   *   { maturity: 17_768_000n, fixedRate: 10_0000000000000000n, fee: 20_0000000000000000n },
   *   2_000_000n,
   * );
   * // net === 50000000000000000n
   * // performanceFee === 10000000000000000n
   * ```
   */
  export const getSettlement = (
    position: {
      debt: BigIntish;
      fixedLeg: BigIntish;
      floatingLeg: BigIntish;
      surplus: BigIntish;
    },
    loan: { maturity: BigIntish; fixedRate: BigIntish; fee: BigIntish },
    timestamp: BigIntish,
  ) => {
    position.fixedLeg = BigInt(position.fixedLeg);

    const residual = getResidual(position, loan, timestamp);
    const net = MathLib.zeroFloorSub(position.fixedLeg + residual, position.floatingLeg);
    const performanceFee = MathLib.mulDivDown(net, loan.fee, MathLib.WAD);
    const surplusFee = MathLib.mulDivDown(position.surplus, loan.fee, MathLib.WAD);

    return { net, performanceFee, surplusFee };
  };

  /**
   * Returns the fixed interest remaining from the given timestamp until maturity, credited to
   * the fixed leg when a loan is settled early, matching Iris's onchain settlement. Returns zero
   * at or after maturity.
   *
   * @param position.debt The position's debt (principal).
   * @param loan.maturity The loan's maturity timestamp (in seconds).
   * @param loan.fixedRate The loan's annual fixed rate (scaled by WAD).
   * @param timestamp The settlement timestamp (in seconds).
   * @returns The residual fixed leg.
   * @example
   * ```ts
   * import { MathLib, PositionUtils } from "@iris-credit/core-sdk";
   *
   * const residual = PositionUtils.getResidual(
   *   { debt: MathLib.WAD },
   *   { maturity: 17_768_000n, fixedRate: 10_0000000000000000n },
   *   2_000_000n,
   * );
   * // residual === 50000000000000000n
   * ```
   */
  export const getResidual = (
    { debt }: { debt: BigIntish },
    { maturity, fixedRate }: { maturity: BigIntish; fixedRate: BigIntish },
    timestamp: BigIntish,
  ) => {
    timestamp = BigInt(timestamp);
    maturity = BigInt(maturity);
    fixedRate = BigInt(fixedRate);

    if (timestamp >= maturity) return 0n;

    const timeToMaturity = MathLib.zeroFloorSub(maturity, timestamp);

    return MathLib.mulDivDown(debt, timeToMaturity * fixedRate, SECONDS_PER_YEAR * MathLib.WAD);
  };

  /**
   * Mirror of Iris's `repay` amount: returns the debt assets required to repay the loan,
   * covering the debt, the fixed leg and the bad bond (the part of the solver's negative
   * net the bond cannot absorb).
   *
   * Expects settled legs: apply the `getAccruedLegs` increments and, before maturity, the
   * `getResidual` credit to the fixed leg, matching the accrue → settle order onchain.
   *
   * @param position.debt The position's debt (principal).
   * @param position.fixedLeg The position's settled fixed leg.
   * @param position.bond The position's bond.
   * @param position.floatingLeg The position's floating leg.
   * @returns The repaid debt assets.
   * @example
   * ```ts
   * import { MathLib, PositionUtils } from "@iris-credit/core-sdk";
   *
   * const repaid = PositionUtils.getRepayAmount({
   *   debt: MathLib.WAD,
   *   fixedLeg: 0n,
   *   bond: 100n,
   *   floatingLeg: 400n,
   * });
   * // repaid === 1000000000000000300n
   * ```
   */
  export const getRepayAmount = (position: {
    debt: BigIntish;
    fixedLeg: BigIntish;
    bond: BigIntish;
    floatingLeg: BigIntish;
  }) => {
    position.debt = BigInt(position.debt);
    position.fixedLeg = BigInt(position.fixedLeg);

    const negativeNet = MathLib.zeroFloorSub(position.floatingLeg, position.fixedLeg);
    const badBond = MathLib.zeroFloorSub(negativeNet, position.bond);

    return position.debt + position.fixedLeg + badBond;
  };

  /**
   * Mirror of Iris's `withdrawCollateral` limit: returns the maximum collateral
   * withdrawable while keeping the loan collateralized through the liquidation deadline.
   *
   * The withdrawal check reserves the worst-case payoff — the debt, the fixed leg and the
   * interest still accruing until `maturity + overduePeriod` (both rates over the overdue
   * window) — against the venue LLTV limit on the remaining collateral's value, as the
   * loan cannot be liquidated before the deadline. Returns `undefined` when the collateral
   * price is unknown, zero once the worst-case payoff reaches the LLTV limit of the
   * collateral's value (notably on a zero price or LLTV), and the full collateral when
   * nothing is owed.
   *
   * Iris accepts `withdrawCollateral(pod, amount, receiver)` iff `amount` does not exceed
   * this limit.
   *
   * Expects accrued legs: apply the `getAccruedLegs` increments beforehand.
   *
   * @param position.collateral The position's collateral.
   * @param position.debt The position's debt (principal).
   * @param position.fixedLeg The position's fixed leg.
   * @param loan.maturity The loan's maturity timestamp (in seconds).
   * @param loan.overduePeriod The loan's overdue period (in seconds).
   * @param loan.fixedRate The loan's annual fixed rate (scaled by WAD).
   * @param loan.overdueRate The loan's annual overdue rate, added on top of the fixed rate past maturity (scaled by WAD).
   * @param venue.price The collateral price quoted in debt assets, from `IVenueAdapter.price` (scaled by ORACLE_PRICE_SCALE), or `undefined` when unknown.
   * @param venue.lltv The venue's LLTV for the loan's token pair, from `IVenueAdapter.lltv` (scaled by WAD).
   * @param timestamp The withdrawal timestamp (in seconds).
   * @returns The withdrawable collateral assets, or `undefined` when the price is unknown.
   * @example
   * ```ts
   * import { MathLib, ORACLE_PRICE_SCALE, PositionUtils } from "@iris-credit/core-sdk";
   *
   * const withdrawable = PositionUtils.getWithdrawableCollateral(
   *   { collateral: 5n * MathLib.WAD, debt: 2n * MathLib.WAD, fixedLeg: 0n },
   *   { maturity: 1_000_000n, overduePeriod: 86_400n, fixedRate: 10_0000000000000000n, overdueRate: 0n },
   *   { price: ORACLE_PRICE_SCALE, lltv: 50_0000000000000000n },
   *   1_086_400n,
   * );
   * // withdrawable === 1000000000000000000n
   * ```
   */
  export const getWithdrawableCollateral = (
    position: { collateral: BigIntish; debt: BigIntish; fixedLeg: BigIntish },
    loan: {
      maturity: BigIntish;
      overduePeriod: BigIntish;
      fixedRate: BigIntish;
      overdueRate: BigIntish;
    },
    { price, lltv }: { price?: BigIntish; lltv: BigIntish },
    timestamp: BigIntish,
  ) => {
    position.collateral = BigInt(position.collateral);
    position.debt = BigInt(position.debt);
    position.fixedLeg = BigInt(position.fixedLeg);
    loan.maturity = BigInt(loan.maturity);
    loan.overduePeriod = BigInt(loan.overduePeriod);
    loan.fixedRate = BigInt(loan.fixedRate);
    loan.overdueRate = BigInt(loan.overdueRate);

    if (price == null) return;

    price = BigInt(price);
    lltv = BigInt(lltv);

    const maxDebt = MathLib.mulDivDown(
      getCollateralValue({ collateral: position.collateral }, { price })!,
      lltv,
      MathLib.WAD,
    );
    const timeToLiquidation = MathLib.zeroFloorSub(loan.maturity + loan.overduePeriod, timestamp);
    const residual = MathLib.mulDivDown(
      position.debt,
      timeToLiquidation * loan.fixedRate +
        MathLib.min(timeToLiquidation, loan.overduePeriod) * loan.overdueRate,
      SECONDS_PER_YEAR * MathLib.WAD,
    );
    const requiredCollateralValue = position.debt + position.fixedLeg + residual;

    if (requiredCollateralValue >= maxDebt) return 0n;

    const requiredCollateral = MathLib.mulDivUp(
      MathLib.mulDivUp(requiredCollateralValue, MathLib.WAD, lltv),
      ORACLE_PRICE_SCALE,
      price,
    );

    return MathLib.zeroFloorSub(position.collateral, requiredCollateral);
  };

  /**
   * Mirror of Iris's `liquidate` seizure: returns the collateral assets seized in exchange
   * for repaying the loan (see `getRepayAmount`) at the given timestamp.
   *
   * The seized collateral is the repaid amount priced in collateral with the liquidation
   * incentive applied (see `LoanUtils.getLif`), capped at the position's collateral.
   * Returns zero while the loan is not yet liquidatable (where Iris reverts with
   * `HealthyLoan` instead) and zero on a zero collateral price; `undefined` when the
   * collateral price is unknown.
   *
   * Expects accrued legs: apply the `getAccruedLegs` increments beforehand. Liquidation
   * only opens past maturity, so settlement credits no residual and the accrued fixed leg
   * is the settled one.
   *
   * @param position.collateral The position's collateral.
   * @param position.debt The position's debt (principal).
   * @param position.bond The position's bond.
   * @param position.fixedLeg The position's fixed leg.
   * @param position.floatingLeg The position's floating leg.
   * @param loan.maturity The loan's maturity timestamp (in seconds).
   * @param loan.overduePeriod The loan's overdue period (in seconds).
   * @param venue.price The collateral price quoted in debt assets, from `IVenueAdapter.price` (scaled by ORACLE_PRICE_SCALE), or `undefined` when unknown.
   * @param timestamp The liquidation timestamp (in seconds).
   * @returns The seized collateral assets (zero while not liquidatable or on a zero
   * price), or `undefined` when the price is unknown.
   * @example
   * ```ts
   * import { MathLib, ORACLE_PRICE_SCALE, PositionUtils } from "@iris-credit/core-sdk";
   *
   * const seized = PositionUtils.getLiquidationSeizedCollateral(
   *   { collateral: 2n * MathLib.WAD, debt: MathLib.WAD, bond: 0n, fixedLeg: 0n, floatingLeg: 0n },
   *   { maturity: 1_000_000n, overduePeriod: 86_400n },
   *   { price: ORACLE_PRICE_SCALE },
   *   1_086_850n,
   * );
   * // seized === 1075000000000000000n
   * ```
   */
  export const getLiquidationSeizedCollateral = (
    position: {
      collateral: BigIntish;
      debt: BigIntish;
      bond: BigIntish;
      fixedLeg: BigIntish;
      floatingLeg: BigIntish;
    },
    { maturity, overduePeriod }: { maturity: BigIntish; overduePeriod: BigIntish },
    { price }: { price?: BigIntish },
    timestamp: BigIntish,
  ) => {
    if (price == null) return;

    price = BigInt(price);
    if (price === 0n || !LoanUtils.isLiquidatable({ maturity, overduePeriod }, timestamp))
      return 0n;

    position.debt = BigInt(position.debt);
    position.fixedLeg = BigInt(position.fixedLeg);

    const repaid = getRepayAmount(position);
    const lif = LoanUtils.getLif({ maturity, overduePeriod }, timestamp);

    return MathLib.min(
      position.collateral,
      MathLib.mulDivDown(
        MathLib.mulDivDown(repaid, MathLib.WAD + lif, MathLib.WAD),
        ORACLE_PRICE_SCALE,
        price,
      ),
    );
  };

  /**
   * Returns the value of the position's collateral quoted in debt assets, as used by Iris's
   * collateral conversions (`withdrawCollateral`, `liquidate`, `_rebase`).
   * `undefined` when the collateral price is unknown.
   *
   * @param position.collateral The position's collateral.
   * @param venue.price The collateral price quoted in debt assets, from `IVenueAdapter.price` (scaled by ORACLE_PRICE_SCALE), or `undefined` when unknown.
   * @returns The collateral value in debt assets, or `undefined` when the price is unknown.
   * @example
   * ```ts
   * import { MathLib, ORACLE_PRICE_SCALE, PositionUtils } from "@iris-credit/core-sdk";
   *
   * const value = PositionUtils.getCollateralValue(
   *   { collateral: 2n * MathLib.WAD },
   *   { price: 3n * ORACLE_PRICE_SCALE },
   * );
   * // value === 6000000000000000000n
   * ```
   */
  export const getCollateralValue = (
    { collateral }: { collateral: BigIntish },
    { price }: { price?: BigIntish },
  ) => {
    if (price == null) return;

    return MathLib.mulDivDown(collateral, price, ORACLE_PRICE_SCALE);
  };

  /**
   * Mirror of Iris's `withdrawBond` limit: returns the maximum bond withdrawable while
   * keeping the bond healthy (see `isHealthyBond`).
   *
   * The remaining bond must cover the bond requirement and keep the drawdown within the
   * loan's bond LLTV. Returns zero on a zero bond LLTV; otherwise, once the loan is closed
   * (zero bond requirement), the full bond is withdrawable. Returns zero when no
   * withdrawal can pass the check, including when the bond is already unhealthy.
   *
   * Iris accepts `withdrawBond(pod, amount, receiver)` iff `amount` does not exceed this
   * limit.
   *
   * Expects accrued legs: apply the `getAccruedLegs` increments beforehand.
   *
   * @param position.bond The position's bond.
   * @param position.bondRequirement The position's bond requirement (zero once the loan is closed).
   * @param position.fixedLeg The position's fixed leg.
   * @param position.floatingLeg The position's floating leg.
   * @param loan.bondLltv The loan's bond LLTV (scaled by WAD).
   * @returns The withdrawable bond assets.
   * @example
   * ```ts
   * import { PositionUtils } from "@iris-credit/core-sdk";
   *
   * const withdrawable = PositionUtils.getWithdrawableBond(
   *   { bond: 1_000n, bondRequirement: 300n, fixedLeg: 0n, floatingLeg: 400n },
   *   { bondLltv: 50_0000000000000000n },
   * );
   * // withdrawable === 200n
   * ```
   */
  export const getWithdrawableBond = (
    position: {
      bond: BigIntish;
      bondRequirement: BigIntish;
      fixedLeg: BigIntish;
      floatingLeg: BigIntish;
    },
    { bondLltv }: { bondLltv: BigIntish },
  ) => {
    position.bond = BigInt(position.bond);
    position.bondRequirement = BigInt(position.bondRequirement);
    bondLltv = BigInt(bondLltv);

    if (bondLltv === 0n) return 0n;
    if (position.bondRequirement === 0n) return position.bond;

    const negativeNet = MathLib.zeroFloorSub(position.floatingLeg, position.fixedLeg);
    const requiredBond = MathLib.max(
      position.bondRequirement,
      MathLib.mulDivUp(negativeNet, MathLib.WAD, bondLltv),
    );

    return MathLib.zeroFloorSub(position.bond, requiredBond);
  };

  /**
   * Mirror of Iris's `liquidateBond` seizure: returns the bond assets seized by the caller
   * for triggering the bond liquidation.
   *
   * The seized bond is the position's bond times the bond liquidation incentive factor
   * (see `LoanUtils.getBondLif`). Returns zero while the bond is healthy (where Iris
   * reverts with `HealthyBond` instead), including once the loan is closed.
   *
   * Expects accrued legs: apply the `getAccruedLegs` increments beforehand, as the health
   * check runs after accrual onchain. Bond liquidation does not settle: no residual is
   * credited.
   *
   * @param position.bond The position's bond.
   * @param position.bondRequirement The position's bond requirement (zero once the loan is closed).
   * @param position.fixedLeg The position's fixed leg.
   * @param position.floatingLeg The position's floating leg.
   * @param loan.bondLltv The loan's bond LLTV (scaled by WAD).
   * @returns The seized bond assets (zero while the bond is healthy).
   * @example
   * ```ts
   * import { MathLib, PositionUtils } from "@iris-credit/core-sdk";
   *
   * const seized = PositionUtils.getBondLiquidationSeizedAmount(
   *   { bond: MathLib.WAD, bondRequirement: 1n, fixedLeg: 0n, floatingLeg: 96_0000000000000000n },
   *   { bondLltv: 95_0000000000000000n },
   * );
   * // seized === 25641025641025641n
   * ```
   */
  export const getBondLiquidationSeizedAmount = (
    position: {
      bond: BigIntish;
      bondRequirement: BigIntish;
      fixedLeg: BigIntish;
      floatingLeg: BigIntish;
    },
    { bondLltv }: { bondLltv: BigIntish },
  ) => {
    if (isHealthyBond(position, { bondLltv })) return 0n;

    return MathLib.mulDivDown(position.bond, LoanUtils.getBondLif({ bondLltv }), MathLib.WAD);
  };

  /**
   * Returns whether the position's bond is healthy: the bond covers the bond requirement, and
   * the drawdown of the floating leg over the fixed leg, relative to the bond, does not exceed
   * the loan's bond LLTV. A closed loan (zero bond requirement) is always healthy.
   *
   * @param position.bond The position's bond.
   * @param position.bondRequirement The position's bond requirement (zero once the loan is closed).
   * @param position.fixedLeg The position's fixed leg.
   * @param position.floatingLeg The position's floating leg.
   * @param loan.bondLltv The loan's bond LLTV (scaled by WAD).
   * @returns Whether the bond is healthy.
   * @example
   * ```ts
   * import { PositionUtils } from "@iris-credit/core-sdk";
   *
   * const healthy = PositionUtils.isHealthyBond(
   *   { bond: 1_000n, bondRequirement: 1n, fixedLeg: 0n, floatingLeg: 500n },
   *   { bondLltv: 50_0000000000000000n },
   * );
   * // healthy === true
   * ```
   */
  export const isHealthyBond = (
    position: {
      bond: BigIntish;
      bondRequirement: BigIntish;
      fixedLeg: BigIntish;
      floatingLeg: BigIntish;
    },
    { bondLltv }: { bondLltv: BigIntish },
  ) => {
    position.bond = BigInt(position.bond);
    position.bondRequirement = BigInt(position.bondRequirement);
    position.fixedLeg = BigInt(position.fixedLeg);
    position.floatingLeg = BigInt(position.floatingLeg);
    bondLltv = BigInt(bondLltv);

    if (position.bondRequirement === 0n) return true;
    if (position.bond < position.bondRequirement) return false;
    if (position.floatingLeg <= position.fixedLeg) return true;

    return getDrawdown(position) <= bondLltv;
  };

  /**
   * Returns the position's drawdown: the floating leg over the fixed leg, relative to the
   * bond (scaled by WAD), rounded up — the ratio the bond health check compares to the
   * loan's bond LLTV (see `isHealthyBond`). Zero when the net is not negative or once the
   * loan is closed (zero bond requirement); `MAX_UINT_256` on a zero bond with a negative
   * net.
   *
   * @param position.bond The position's bond.
   * @param position.bondRequirement The position's bond requirement (zero once the loan is closed).
   * @param position.fixedLeg The position's fixed leg.
   * @param position.floatingLeg The position's floating leg.
   * @returns The drawdown, scaled by WAD.
   * @example
   * ```ts
   * import { PositionUtils } from "@iris-credit/core-sdk";
   *
   * const drawdown = PositionUtils.getDrawdown({
   *   bond: 1_000n,
   *   bondRequirement: 1n,
   *   fixedLeg: 0n,
   *   floatingLeg: 500n,
   * });
   * // drawdown === 500000000000000000n
   * ```
   */
  export const getDrawdown = (position: {
    bond: BigIntish;
    bondRequirement: BigIntish;
    fixedLeg: BigIntish;
    floatingLeg: BigIntish;
  }) => {
    position.bond = BigInt(position.bond);
    position.bondRequirement = BigInt(position.bondRequirement);

    const negativeNet = MathLib.zeroFloorSub(position.floatingLeg, position.fixedLeg);
    if (negativeNet === 0n) return 0n;
    if (position.bondRequirement === 0n) return 0n;
    if (position.bond === 0n) return MathLib.MAX_UINT_256;

    return MathLib.mulDivUp(negativeNet, MathLib.WAD, position.bond);
  };
}

import type { BigIntish } from "../../types.js";

import { SECONDS_PER_YEAR } from "../../constants.js";
import { IrisCoreErrors } from "../../errors.js";
import { MathLib } from "../../math/index.js";

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
   * Throws when the timestamp is prior to the last update or a venue index is prior to the
   * stored one (both revert onchain).
   *
   * @param position.collateral The position's collateral before accrual.
   * @param position.debt The position's debt (principal).
   * @param position.bondRequirement The position's bond requirement (zero once the loan is closed, which skips the surplus accrual).
   * @param position.collateralIndex The venue's collateral index at the last update (scaled by WAD).
   * @param position.debtIndex The venue's debt index at the last update (scaled by WAD).
   * @param position.floatingLeg The position's floating leg before accrual.
   * @param position.surplus The position's surplus before accrual.
   * @param position.lastUpdate The timestamp of the last accrual (in seconds).
   * @param loan.maturity The loan's maturity timestamp (in seconds).
   * @param loan.fixedRate The loan's annual fixed rate (scaled by WAD).
   * @param loan.overdueRate The loan's annual overdue rate, added on top of the fixed rate past maturity (scaled by WAD).
   * @param newCollateralIndex The venue's current collateral index, from `IVenueAdapter.indices` (scaled by WAD).
   * @param newDebtIndex The venue's current debt index, from `IVenueAdapter.indices` (scaled by WAD).
   * @param timestamp The timestamp at which to accrue interest (in seconds).
   * @returns The new venue indices (scaled by WAD) and the `fixedLeg`, `floatingLeg` & `surplus` increments.
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
   *   MathLib.WAD,
   *   MathLib.WAD,
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
    newCollateralIndex: BigIntish,
    newDebtIndex: BigIntish,
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
    newCollateralIndex = BigInt(newCollateralIndex);
    newDebtIndex = BigInt(newDebtIndex);
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

    if (elapsed < 0n)
      throw new IrisCoreErrors.InvalidInterestAccrual(timestamp, position.lastUpdate);
    if (newCollateralIndex < position.collateralIndex)
      throw new IrisCoreErrors.InvalidVenueIndex(
        "collateral",
        newCollateralIndex,
        position.collateralIndex,
      );
    if (newDebtIndex < position.debtIndex)
      throw new IrisCoreErrors.InvalidVenueIndex("debt", newDebtIndex, position.debtIndex);

    let fixedLeg = MathLib.mulDivDown(
      position.debt,
      elapsed * loan.fixedRate,
      SECONDS_PER_YEAR * MathLib.WAD,
    );
    const floatingLegDelta = MathLib.mulDivDown(
      position.debt + position.floatingLeg,
      newDebtIndex - position.debtIndex,
      position.debtIndex,
    );
    const surplusDelta =
      position.bondRequirement !== 0n
        ? MathLib.mulDivDown(
            position.collateral + position.surplus,
            newCollateralIndex - position.collateralIndex,
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
      collateralIndex: newCollateralIndex,
      debtIndex: newDebtIndex,
      fixedLeg,
      floatingLeg: floatingLegDelta,
      surplus: surplusDelta,
    };
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
   * Returns the debt-token assets pulled from the payer when the position is repaid at the
   * given timestamp, matching Iris's onchain repayment: the debt (principal), the fixed leg —
   * topped up with the residual fixed interest to maturity on an early settlement — and the
   * part of the floating leg's excess over the fixed leg that the bond does not cover (the
   * bad bond, charged to the payer).
   *
   * Legs must already be accrued to `timestamp` (see {@link getAccruedLegs}); this function
   * only credits the settlement residual on top, mirroring `Iris.repay`'s
   * accrue-then-settle order. The onchain amount keeps moving with the venue and clock —
   * overdue interest past maturity, floating-leg growth in the bad-bond case — so fund a
   * repayment with a small buffer on top of this value.
   *
   * @param position.debt The position's debt (principal).
   * @param position.bond The position's bond.
   * @param position.fixedLeg The position's fixed leg, accrued to `timestamp`.
   * @param position.floatingLeg The position's floating leg, accrued to `timestamp`.
   * @param loan.maturity The loan's maturity timestamp (in seconds).
   * @param loan.fixedRate The loan's annual fixed rate (scaled by WAD).
   * @param timestamp The repayment timestamp (in seconds).
   * @returns The debt-token assets transferred from the payer.
   * @example
   * ```ts
   * import { MathLib, PositionUtils } from "@iris-credit/core-sdk";
   *
   * const repaid = PositionUtils.getRepaid(
   *   { debt: MathLib.WAD, bond: 0n, fixedLeg: 0n, floatingLeg: 0n },
   *   { maturity: 17_768_000n, fixedRate: 10_0000000000000000n },
   *   2_000_000n,
   * );
   * // repaid === MathLib.WAD + 50000000000000000n
   * ```
   */
  export const getRepaid = (
    position: {
      debt: BigIntish;
      bond: BigIntish;
      fixedLeg: BigIntish;
      floatingLeg: BigIntish;
    },
    loan: { maturity: BigIntish; fixedRate: BigIntish },
    timestamp: BigIntish,
  ) => {
    position.debt = BigInt(position.debt);
    position.bond = BigInt(position.bond);
    position.fixedLeg = BigInt(position.fixedLeg);
    position.floatingLeg = BigInt(position.floatingLeg);

    const fixedLeg = position.fixedLeg + getResidual(position, loan, timestamp);
    const negativeNet = position.floatingLeg > fixedLeg ? position.floatingLeg - fixedLeg : 0n;
    const badBond = MathLib.zeroFloorSub(negativeNet, position.bond);

    return position.debt + fixedLeg + badBond;
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

    const negativeNet = position.floatingLeg - position.fixedLeg;
    const drawdown = MathLib.mulDivUp(negativeNet, MathLib.WAD, position.bond);

    return drawdown <= bondLltv;
  };
}

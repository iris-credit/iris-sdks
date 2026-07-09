import type { BigIntish } from "../../types.js";

import { LIQUIDATION_CURSOR, MAX_BOND_LIF, MAX_LIF, TIME_TO_MAX_LIF } from "../../constants.js";
import { MathLib } from "../../math/index.js";

/** Namespace of utility functions to ease loan-related calculations. */
export namespace LoanUtils {
  /**
   * Returns the liquidation incentive factor for an overdue loan, growing linearly from 0 at
   * `maturity + overduePeriod` to `MAX_LIF` over `TIME_TO_MAX_LIF`. Returns 0 while the loan is
   * not yet liquidatable (where Iris reverts with `HealthyLoan` instead).
   *
   * @param loan.maturity The loan's maturity timestamp (in seconds).
   * @param loan.overduePeriod The loan's overdue period (in seconds).
   * @param timestamp The liquidation timestamp (in seconds).
   * @returns The liquidation incentive factor, scaled by WAD.
   * @example
   * ```ts
   * import { LoanUtils } from "@iris-credit/core-sdk";
   *
   * const lif = LoanUtils.getLif({ maturity: 1_000_000n, overduePeriod: 86_400n }, 1_086_850n);
   * // lif === 75000000000000000n
   * ```
   */
  export const getLif = (
    { maturity, overduePeriod }: { maturity: BigIntish; overduePeriod: BigIntish },
    timestamp: BigIntish,
  ) => {
    maturity = BigInt(maturity);
    overduePeriod = BigInt(overduePeriod);

    const overdueElapsed = MathLib.zeroFloorSub(timestamp, maturity + overduePeriod);

    return MathLib.min(MAX_LIF, MathLib.mulDivDown(MAX_LIF, overdueElapsed, TIME_TO_MAX_LIF));
  };

  /**
   * Returns the liquidation incentive factor for a bond liquidation, i.e.
   * `min(MAX_BOND_LIF, 1 / (1 - cursor * (1 - bondLltv)) - 1)`.
   *
   * @param loan.bondLltv The loan's bond LLTV (scaled by WAD).
   * @returns The liquidation incentive factor, scaled by WAD.
   * @example
   * ```ts
   * import { LoanUtils } from "@iris-credit/core-sdk";
   *
   * const lif = LoanUtils.getBondLif({ bondLltv: 95_0000000000000000n });
   * // lif === 25641025641025641n
   * ```
   */
  export const getBondLif = ({ bondLltv }: { bondLltv: BigIntish }) => {
    bondLltv = BigInt(bondLltv);

    const cursored = MathLib.mulDivDown(LIQUIDATION_CURSOR, MathLib.WAD - bondLltv, MathLib.WAD);

    return MathLib.min(
      MAX_BOND_LIF,
      MathLib.mulDivDown(MathLib.WAD, MathLib.WAD, MathLib.WAD - cursored) - MathLib.WAD,
    );
  };

  /**
   * The earliest timestamp at which the loan is liquidatable.
   */
  export const liquidatableAt = ({
    maturity,
    overduePeriod,
  }: {
    maturity: BigIntish;
    overduePeriod: BigIntish;
  }) => BigInt(maturity) + BigInt(overduePeriod) + 1n;

  /**
   * Whether the loan is past maturity at `timestamp`.
   * TODO: In the API, overdue and liquidatable are mutually exclusive statuses,
   * whereas the SDK allows both to be true.
   * We should standardize this behavior on either the SDK side or the API side.
   */
  export const isOverdue = ({ maturity }: { maturity: BigIntish }, timestamp: BigIntish) =>
    BigInt(timestamp) > BigInt(maturity);

  /**
   * Whether the loan is liquidatable at `timestamp`.
   */
  export const isLiquidatable = (
    loan: { maturity: BigIntish; overduePeriod: BigIntish },
    timestamp: BigIntish,
  ) => BigInt(timestamp) >= liquidatableAt(loan);

  /**
   * Whether `venueId` is allowed by the loan's venue bitmap (bit `venueId` set).
   */
  export const isVenueAllowed = ({ venueBitmap }: { venueBitmap: BigIntish }, venueId: BigIntish) =>
    ((BigInt(venueBitmap) >> BigInt(venueId)) & 1n) === 1n;
}

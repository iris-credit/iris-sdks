import type { BigIntish } from "../../types.js";

import { BP, LIQUIDATION_CURSOR, MAX_BOND_LIF, MAX_LIF, TIME_TO_MAX_LIF } from "../../constants.js";
import { MathLib } from "../../math/index.js";

export namespace LoanUtils {
  /**
   * Whether overdue interest is accruing, mirroring the `block.timestamp > loan.maturity`
   * check in `Iris._accrueLegsView`.
   *
   * @param loan.maturity Maturity timestamp, in seconds.
   * @param timestamp Timestamp at which to evaluate, in seconds.
   */
  export const isOverdue = ({ maturity }: { maturity: BigIntish }, timestamp: BigIntish) =>
    BigInt(timestamp) > BigInt(maturity);

  /**
   * The timestamp strictly after which the loan becomes liquidatable
   * (`loan.maturity + loan.overduePeriod`), as required by `Iris.liquidate` and counted
   * against by the `Iris.withdrawCollateral` health check.
   *
   * @param loan.maturity Maturity timestamp, in seconds.
   * @param loan.overduePeriod Grace period after maturity, in seconds.
   */
  export const liquidatableAt = ({
    maturity,
    overduePeriod,
  }: {
    maturity: BigIntish;
    overduePeriod: BigIntish;
  }) => BigInt(maturity) + BigInt(overduePeriod);

  /**
   * The overdue-liquidation incentive factor of `Iris.liquidate`: grows linearly from 0 at
   * `maturity + overduePeriod` to `MAX_LIF` over `TIME_TO_MAX_LIF`. Returns 0 up to
   * `liquidatableAt`, where `Iris.liquidate` reverts with `HealthyLoan` instead.
   *
   * @param loan.maturity Maturity timestamp, in seconds.
   * @param loan.overduePeriod Grace period after maturity, in seconds.
   * @param timestamp Timestamp at which to evaluate, in seconds.
   * @returns WAD-scaled factor (e.g. 0.15e18 = a 15% bonus).
   */
  export const liquidationIncentiveFactor = (
    loan: { maturity: BigIntish; overduePeriod: BigIntish },
    timestamp: BigIntish,
  ) =>
    MathLib.min(
      MAX_LIF,
      MathLib.mulDivDown(
        MAX_LIF,
        MathLib.zeroFloorSub(timestamp, liquidatableAt(loan)),
        TIME_TO_MAX_LIF,
      ),
    );

  /**
   * Bit-exact mirror of the bond-liquidation incentive factor of `Iris.liquidateBond`:
   * `min(MAX_BOND_LIF, 1 / (1 - LIQUIDATION_CURSOR * (1 - bondLltv)) - 1)`.
   *
   * @param loan.bondLltv Bond LLTV in basis points, as stored on `Loan` (the WAD-scaled
   * `Quote.bondLltv` divided by BP).
   * @returns WAD-scaled factor.
   */
  export const bondLiquidationIncentiveFactor = ({ bondLltv }: { bondLltv: BigIntish }) =>
    MathLib.min(
      MAX_BOND_LIF,
      MathLib.mulDivDown(
        MathLib.WAD,
        MathLib.WAD,
        MathLib.WAD -
          MathLib.mulDivDown(LIQUIDATION_CURSOR, MathLib.WAD - BigInt(bondLltv) * BP, MathLib.WAD),
      ) - MathLib.WAD,
    );

  /**
   * Whether a venue is allowed by the loan's venue bitmap, mirroring the
   * `(venueBitmap >> venueId) & 1 == 1` check of `Iris.take` and `Iris.refinance`.
   * Refinancing to the venue additionally requires contract state: an adapter set for the
   * venue id and enabled venue data.
   *
   * @param loan.venueBitmap Bitmap of allowed venue ids.
   * @param venueId Venue id (bit index, < 128).
   */
  export const isVenueAllowed = ({ venueBitmap }: { venueBitmap: BigIntish }, venueId: BigIntish) =>
    ((BigInt(venueBitmap) >> BigInt(venueId)) & 1n) === 1n;
}

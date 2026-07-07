import type { BigIntish } from "../../types.js";

/** Namespace of utility functions to ease loan-related calculations. */
export namespace LoanUtils {
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

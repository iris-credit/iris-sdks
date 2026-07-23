import type { BigIntish } from "../../types.js";

/** Venue indices at a point in time. */
export interface VenueIndices {
  /** The venue's collateral index. */
  collateralIndex: bigint;
  /** The venue's debt index. */
  debtIndex: bigint;
}

/**
 * Represents the state of the venue backing a loan — the variable-rate market (Morpho Blue,
 * Aave V3) whose indices drive the position's floating leg and surplus — with the rate model
 * needed to project its indices to an arbitrary timestamp.
 *
 * Each implementation mirrors its venue adapter's onchain `indices` definition, so projected
 * values stay on the same scale as the indices Iris stores on positions. Projections assume
 * the venue's current rates persist — the same assumption the venues themselves make between
 * touches — so they are exact at the snapshot and first-order approximations beyond it.
 */
export abstract class Venue {
  /**
   * Returns the venue indices projected to the given timestamp. A timestamp at or before the
   * venue state's own last update returns the unprojected indices (no backward projection).
   *
   * @param timestamp - The timestamp to project to (in seconds).
   */
  public abstract indices(timestamp: BigIntish): VenueIndices;
}

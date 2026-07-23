import type { BigIntish } from "../../types.js";
import type { VenueIndices } from "./Venue.js";

import { AaveV3Utils } from "./AaveV3Utils.js";
import { Venue } from "./Venue.js";

/** Plain input shape for one side of an Aave V3 venue: the reserve state a projection needs. */
export interface IAaveReserve {
  /** The reserve's stored index — `liquidityIndex` (collateral) or `variableBorrowIndex` (debt), scaled by RAY. */
  index: bigint;
  /** The reserve's current annual rate — `currentLiquidityRate` or `currentVariableBorrowRate`, scaled by RAY. */
  rate: bigint;
  /** The reserve's `lastUpdateTimestamp` (in seconds). */
  lastUpdateTimestamp: bigint;
}

/** Plain input shape for an Aave V3 venue. */
export interface IAaveV3Venue {
  /** The collateral asset's reserve state. */
  collateralReserve: IAaveReserve;
  /** The debt asset's reserve state. */
  debtReserve: IAaveReserve;
}

/**
 * Represents an Aave V3 venue: the collateral and debt reserves backing the loan, with Aave's
 * interest model used to project the reserve indices.
 */
export class AaveV3Venue extends Venue implements IAaveV3Venue {
  public collateralReserve: IAaveReserve;
  public debtReserve: IAaveReserve;

  constructor(venue: IAaveV3Venue) {
    super();

    this.collateralReserve = venue.collateralReserve;
    this.debtReserve = venue.debtReserve;
  }

  /**
   * Returns the venue indices projected to the given timestamp, accumulating each reserve's
   * interest from its own `lastUpdateTimestamp` with Aave's math — linear for the liquidity
   * index, compounded for the variable borrow index.
   *
   * @param timestamp - The timestamp to project to (in seconds).
   * @returns The projected collateral and debt indices (scaled by RAY).
   */
  public indices(timestamp: BigIntish): VenueIndices {
    timestamp = BigInt(timestamp);

    return {
      collateralIndex: AaveV3Utils.rayMul(
        AaveV3Utils.getLinearInterest(
          this.collateralReserve.rate,
          this.collateralReserve.lastUpdateTimestamp,
          timestamp,
        ),
        this.collateralReserve.index,
      ),
      debtIndex: AaveV3Utils.rayMul(
        AaveV3Utils.getCompoundedInterest(
          this.debtReserve.rate,
          this.debtReserve.lastUpdateTimestamp,
          timestamp,
        ),
        this.debtReserve.index,
      ),
    };
  }
}

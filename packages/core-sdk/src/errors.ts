export namespace IrisCoreErrors {
  /** Error thrown when position accrual is requested before `lastUpdate`. */
  export class InvalidInterestAccrual extends Error {
    constructor(
      public readonly timestamp: bigint,
      public readonly lastUpdate: bigint,
    ) {
      super(
        `invalid interest accrual: accrual timestamp ${timestamp} can't be prior to last update ${lastUpdate}`,
      );
    }
  }

  /** Error thrown when a venue index is prior to the position's stored index. */
  export class InvalidVenueIndex extends Error {
    constructor(
      public readonly kind: "collateral" | "debt",
      public readonly index: bigint,
      public readonly lastIndex: bigint,
    ) {
      super(`invalid ${kind} venue index: ${index} can't be prior to last index ${lastIndex}`);
    }
  }
}

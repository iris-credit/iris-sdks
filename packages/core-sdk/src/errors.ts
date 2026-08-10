import type { Address, Hex } from "viem";
import type { ChainId } from "./chain.js";

/** Error thrown when a chain id has no registered chain addresses or metadata. */
export class UnsupportedChainIdError extends Error {
  constructor(public readonly chainId: number) {
    super(`unsupported chain id ${chainId}`);
  }
}

/** Error thrown when a venue adapter has no offline rate model registered in the SDK. */
export class UnsupportedVenueAdapterError extends Error {
  constructor(
    public readonly adapter: Address,
    public readonly chainId: ChainId,
  ) {
    super(`unsupported venue adapter ${adapter} on chain ${chainId}`);
  }
}

/** Error thrown when a token has no Aave V3 reserve tokens registered in the SDK. */
export class UnsupportedAaveV3TokenError extends Error {
  constructor(
    public readonly token: Address,
    public readonly chainId: ChainId,
  ) {
    super(`unsupported Aave V3 token ${token} on chain ${chainId}`);
  }
}

/** Error thrown when a data hash has no market data payload recorded in the SDK registry. */
export class UnknownDataHashError extends Error {
  constructor(
    public readonly dataHash: Hex,
    public readonly chainId: ChainId,
  ) {
    super(`unknown data hash ${dataHash} on chain ${chainId}`);
  }
}

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

  /** Error thrown when venue accrual is requested before a venue side's last update. */
  export class InvalidVenueInterestAccrual extends Error {
    constructor(
      public readonly kind: "collateral" | "debt",
      public readonly timestamp: bigint,
      public readonly lastUpdate: bigint,
    ) {
      super(
        `invalid ${kind} venue interest accrual: accrual timestamp ${timestamp} can't be prior to last update ${lastUpdate}`,
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

  /** Error thrown when a venue price is unknown. */
  export class UnknownVenuePrice extends Error {
    constructor(
      public readonly pod: Address,
      public readonly venueId: bigint,
    ) {
      super(`unknown venue price for pod ${pod} and venue ${venueId}`);
    }
  }

  /** Error thrown when a venue collateral withdrawal would leave the pod's venue position unhealthy. */
  export class InsufficientVenueCollateral extends Error {
    constructor(
      public readonly pod: Address,
      public readonly venueId: bigint,
    ) {
      super(`insufficient venue collateral for pod ${pod} and venue ${venueId}`);
    }
  }

  /** Error thrown when a venue position is negative. */
  export class InsufficientVenuePosition extends Error {
    constructor(
      public readonly pod: Address,
      public readonly venueId: bigint,
    ) {
      super(`insufficient venue position for pod ${pod} and venue ${venueId}`);
    }
  }

  /** Error thrown when a venue borrow would exceed the market's total supply. */
  export class InsufficientVenueLiquidity extends Error {
    constructor(
      public readonly pod: Address,
      public readonly venueId: bigint,
    ) {
      super(`insufficient venue liquidity for pod ${pod} and venue ${venueId}`);
    }
  }

  /** Error thrown when a position's loan or venue belongs to a different pod. */
  export class UnexpectedPod extends Error {
    constructor(
      public readonly expected: Address,
      public readonly actual: Address,
    ) {
      super(`unexpected pod: expected ${expected}, got ${actual}`);
    }
  }

  /** Error thrown when a liquidation is requested before the loan's liquidation deadline. */
  export class HealthyLoan extends Error {
    constructor(public readonly pod: Address) {
      super(`healthy loan for pod ${pod}: not liquidatable yet`);
    }
  }

  /** Error thrown when a bond liquidation is requested while the bond is healthy. */
  export class HealthyBond extends Error {
    constructor(public readonly pod: Address) {
      super(`healthy bond for pod ${pod}: not liquidatable`);
    }
  }

  /** Error thrown when a collateral withdrawal would leave the loan undercollateralized. */
  export class InsufficientCollateral extends Error {
    constructor(public readonly pod: Address) {
      super(`insufficient collateral for pod ${pod}`);
    }
  }

  /**
   * Error thrown when a venue is not the market the position is held on. The id alone does
   * not identify it: one adapter serves many markets, told apart by their data.
   */
  export class UnexpectedVenue extends Error {
    constructor(
      public readonly expectedId: bigint,
      public readonly actualId: bigint,
      public readonly expectedData: Hex,
      public readonly actualData: Hex,
    ) {
      super(
        `unexpected venue: expected ${expectedId} (${expectedData}), got ${actualId} (${actualData})`,
      );
    }
  }

  /** Error thrown when an operation requires an open loan but the loan is resolved. */
  export class LoanResolved extends Error {
    constructor(public readonly pod: Address) {
      super(`loan resolved for pod ${pod}`);
    }
  }

  /** Error thrown when a venue is not allowed by the loan's venue bitmap. */
  export class NotAllowedVenue extends Error {
    constructor(
      public readonly pod: Address,
      public readonly venueId: bigint,
    ) {
      super(`venue ${venueId} is not allowed for pod ${pod}`);
    }
  }

  /** Error thrown when a bond withdrawal would leave the bond unhealthy. */
  export class InsufficientBond extends Error {
    constructor(public readonly pod: Address) {
      super(`insufficient bond for pod ${pod}`);
    }
  }

  /** Error thrown when a quote's bond requirement is zero, making it unsubmittable. */
  export class ZeroBondRequirement extends Error {
    constructor(
      public readonly blm: Address,
      public readonly token: Address,
    ) {
      super(`zero bond requirement for token ${token} on blm ${blm}: unsubmittable quote`);
    }
  }
}

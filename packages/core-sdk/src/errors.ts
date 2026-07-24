import type { Address } from "viem";
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

/** Error thrown when a token address has no curated metadata entry. */
export class TokenMetadataNotFoundError extends Error {
  constructor(
    public readonly chainId: ChainId,
    public readonly address: Address,
  ) {
    super(`token metadata not found for address ${address} on chain ${chainId}`);
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

  /** Error thrown when a position's loan or venue belongs to a different pod. */
  export class UnexpectedPod extends Error {
    constructor(
      public readonly expected: Address,
      public readonly actual: Address,
    ) {
      super(`unexpected pod: expected ${expected}, got ${actual}`);
    }
  }
}

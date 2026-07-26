import type { Address } from "viem";

/**
 * Typed errors thrown while encoding supported Bundler3 actions.
 *
 * @remarks
 * Import these classes through `@iris-credit/iris-sdk` when handling
 * failures from `BundlerAction`.
 */
export namespace BundlerErrors {
  /**
   * Thrown when an action that requires an offchain signature is encoded before
   * the signature has been attached.
   */
  export class MissingSignature extends Error {
    constructor() {
      super("missing signature");
    }
  }

  /**
   * Thrown when an action is unsupported on the requested chain.
   */
  export class UnexpectedAction extends Error {
    /**
     * @param type - Unsupported Bundler3 action discriminator or name.
     * @param chainId - Chain where the action was requested.
     */
    constructor(type: string, chainId: number) {
      super(`unexpected action "${type}" on chain "${chainId}"`);
    }
  }

  /**
   * Thrown when an Iris authorization signature names a forbidden `authorized` account
   * (for example Bundler3 itself), which would grant operator rights to an unintended address.
   */
  export class UnexpectedSignature extends Error {
    /**
     * @param authorized - The forbidden `authorized` address carried by the signature.
     */
    constructor(authorized: Address) {
      super(`unexpected signature authorizing "${authorized}"`);
    }
  }
}

/**
 * Thrown when `buildTx` receives more than one requirement signature of the same kind.
 *
 * A bundled path consumes at most one permit and one authorization signature; passing several of
 * the same kind is ambiguous and would silently drop all but the first, so it is rejected instead.
 */
export class AmbiguousRequirementSignaturesError extends Error {
  /**
   * @param kind - The over-supplied signature kind (`"permit"` or `"authorization"`).
   * @param count - How many signatures of that kind were received.
   */
  constructor(kind: "permit" | "authorization", count: number) {
    super(
      `Expected at most one ${kind} signature but received ${count}. Pass a single ${kind} signature to buildTx.`,
    );
  }
}

/**
 * Thrown when `buildTx` receives a requirement signature of a kind the operation does not consume
 * (for example an authorization signature on a plain supply path). Surfacing it prevents a signed
 * authorization or permit from being silently ignored.
 */
export class UnexpectedRequirementSignatureError extends Error {
  /**
   * @param kind - The unexpected signature kind (`"permit"` or `"authorization"`).
   */
  constructor(kind: "permit" | "authorization") {
    super(
      `Received a ${kind} signature that this operation does not consume. Remove it from the buildTx signatures array.`,
    );
  }
}

/** Thrown when a viem client's account address does not match the address required by the call. */
export class AddressMismatchError extends Error {
  constructor(clientAddress: Address, argsAddress: Address) {
    super(`Address mismatch between client: ${clientAddress} and args: ${argsAddress}`);
  }
}

/** Thrown when a viem client's chain id does not match the chain id required by the call. */
export class ChainIdMismatchError extends Error {
  constructor(clientChainId: number | undefined, argsChainId: number) {
    super(`Chain ID mismatch between client: ${clientChainId} and args: ${argsChainId}`);
  }
}

/** Thrown when the viem client is missing a property the call requires (e.g. `account.address`). */
export class MissingClientPropertyError extends Error {
  constructor(property: string) {
    super(`A required ${property} is missing from the client.`);
  }
}

/** Thrown when an approval amount is smaller than the spend amount it must cover. */
export class ApprovalAmountLessThanSpendAmountError extends Error {
  constructor() {
    super("Approval amount is less than spend amount");
  }
}

/** Thrown when a requirement encoder targets an unsupported spender. */
export class UnsupportedErc20ApprovalSpenderError extends Error {
  constructor(params: {
    readonly spender: Address;
    readonly chainId: number;
    readonly generalAdapter1: Address;
    readonly permit2?: Address;
    readonly supportedSpenders?: readonly (Address | undefined)[];
  }) {
    const supported = (params.supportedSpenders ?? [params.generalAdapter1, params.permit2])
      .filter((address) => address != null)
      .join('", "');
    super(
      `Requirement spender "${params.spender}" is not supported on chain "${params.chainId}". Use "${supported}".`,
    );
  }
}

/** Thrown when a deposit's amount differs from the amount the supplied permit / permit2 signature was issued for. */
export class DepositAmountMismatchError extends Error {
  constructor(depositAmount: bigint, signatureAmount: bigint) {
    super(
      `Deposit amount "${depositAmount}" does not match requirement signature amount "${signatureAmount}"`,
    );
  }
}

/** Thrown when a deposit's asset differs from the asset the supplied permit / permit2 signature was issued for. */
export class DepositAssetMismatchError extends Error {
  constructor(depositAsset: Address, signatureAsset: Address) {
    super(
      `Deposit asset "${depositAsset}" does not match requirement signature asset "${signatureAsset}"`,
    );
  }
}

/** Thrown when a `permit2` requirement signature is missing the `expiration` field. */
export class Permit2ExpirationMissingError extends Error {
  constructor() {
    super(
      'Requirement signature with action.type === "permit2" must include args.expiration. Re-sign using the permit2 flow.',
    );
  }
}

/**
 * Thrown when a pod has no Iris loan — its loan struct is still zeroed, which every loan
 * operation rejects.
 */
export class LoanNotCreatedError extends Error {
  constructor(pod: Address) {
    super(`No Iris loan exists for pod "${pod}". Check the pod address.`);
  }
}

/**
 * Thrown when an operation needs an open loan but the pod's loan is already resolved — its debt,
 * legs and bond requirement are cleared, which every closing operation rejects.
 */
export class LoanResolvedError extends Error {
  constructor(pod: Address) {
    super(
      `The Iris loan of pod "${pod}" is already resolved and owes nothing. Withdraw its collateral instead.`,
    );
  }
}

/** Thrown when an address field the contract requires to be non-zero is the zero address. */
export class ZeroAddressError extends Error {
  constructor(field: string) {
    super(`The ${field} must not be the zero address.`);
  }
}

/** Thrown when a WAD-scaled quote rate is not a whole multiple of BP (1e14), which `Iris.take` rejects. */
export class NotMultipleOfBpError extends Error {
  constructor(field: string, value: bigint) {
    super(
      `Quote ${field} ${value} is not a multiple of BP (1e14). Rates are stored in whole basis points on-chain; request a quote with a BP-aligned rate.`,
    );
  }
}

/** Thrown when a non-negative input receives a negative value. */
export class NegativeInputError extends Error {
  constructor(field: string, value: bigint) {
    super(`Input "${field}" must be non-negative, got "${value}".`);
  }
}

/** Thrown when an input that must be positive is zero or negative. */
export class NonPositiveInputError extends Error {
  constructor(field: string, value: bigint) {
    super(`Input "${field}" must be positive, got "${value}".`);
  }
}

/** Thrown when a native amount is supplied for an asset that is not the chain's wrapped native token. */
export class NativeAmountOnNonWNativeAssetError extends Error {
  constructor(asset: Address, wNative: Address) {
    super(`Cannot use nativeAmount: asset ${asset} is not the wrapped native token ${wNative}`);
  }
}

/** Thrown when a take's native amount exceeds the quote's collateral it must fund. */
export class NativeAmountExceedsCollateralError extends Error {
  constructor(collateral: bigint, nativeAmount: bigint) {
    super(
      `Native amount ${nativeAmount} exceeds the quote's collateral ${collateral}. Pay at most the collateral in native token.`,
    );
  }
}

/**
 * Thrown when a bond withdrawal exceeds the position's withdrawable bond — the ceiling Iris's
 * post-withdrawal bond health check enforces, measured against the buffered bond LLTV.
 */
export class WithdrawExceedsWithdrawableBondError extends Error {
  constructor(params: {
    readonly pod: Address;
    readonly withdrawAmount: bigint;
    readonly withdrawable: bigint;
  }) {
    super(
      `Withdraw amount ${params.withdrawAmount} exceeds the withdrawable bond ${params.withdrawable} of pod "${params.pod}". Withdraw at most the withdrawable bond, or supply bond first.`,
    );
  }
}

/**
 * Thrown when a claim exceeds the account's claimable balance for the token — `Iris.claim` debits
 * that balance directly, so an oversized claim reverts with a bare arithmetic underflow.
 */
export class ClaimExceedsClaimableError extends Error {
  constructor(params: {
    readonly token: Address;
    readonly account: Address;
    readonly amount: bigint;
    readonly claimable: bigint;
  }) {
    super(
      `Claim amount ${params.amount} exceeds the claimable ${params.claimable} of account "${params.account}" for token "${params.token}". Claim at most the claimable balance.`,
    );
  }
}

/** Thrown when the solver's Permit2 payload was signed for a token other than the quote's debt token. */
export class SolverPermit2AssetMismatchError extends Error {
  constructor(debtToken: Address, signedToken: Address) {
    super(
      `Solver Permit2 payload is signed for token "${signedToken}" but the quote's bond is pulled in debt token "${debtToken}".`,
    );
  }
}

/** Thrown when the solver's Permit2 payload was signed for an amount below the quote's bond. */
export class SolverPermit2AmountBelowBondError extends Error {
  constructor(bond: bigint, signedAmount: bigint) {
    super(
      `Solver Permit2 payload is signed for amount ${signedAmount}, below the quote's bond ${bond}. The bond pull would revert on-chain.`,
    );
  }
}

/** Thrown when the solver's Permit2 payload has an expired allowance expiration or signature deadline. */
export class SolverPermit2ExpiredError extends Error {
  constructor(params: { readonly expiration: bigint; readonly sigDeadline: bigint }) {
    super(
      `Solver Permit2 payload is expired (expiration ${params.expiration}, sigDeadline ${params.sigDeadline}). Request a fresh quote.`,
    );
  }
}

/** Thrown when a quote's deadline has passed. */
export class QuoteExpiredError extends Error {
  constructor(deadline: bigint) {
    super(`Quote deadline ${deadline} has passed. Request a fresh quote.`);
  }
}

/** Thrown when a quote field is outside the protocol bounds mirrored from `ConstantsLib`. */
export class QuoteOutOfBoundsError extends Error {
  constructor(field: string, value: bigint, min: bigint, max: bigint) {
    super(`Quote ${field} ${value} is out of bounds [${min}, ${max}].`);
  }
}

/** Thrown when a quote's venue id is not enabled in its venue bitmap. */
export class VenueNotSupportedError extends Error {
  constructor(venueId: bigint, venueBitmap: bigint) {
    super(
      `Venue ${venueId} is not set in the quote's venue bitmap ${venueBitmap}. Take a venue the solver enabled.`,
    );
  }
}

/** Thrown when EIP-712 signature verification fails (the signed data does not match the expected signer). */
export class InvalidSignatureError extends Error {
  constructor() {
    super(
      "Signature verification failed: the signed data does not match the expected signer address",
    );
  }
}

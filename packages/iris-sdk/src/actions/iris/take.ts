import type { Hex } from "viem";
import type { ChainId, Quote } from "@iris-credit/core-sdk";
import type { Action } from "../../bundler/type.js";
import type {
  AuthorizationRequirementSignature,
  IrisTakeAction,
  PermitRequirementSignature,
  SolverPermit2,
  Transaction,
} from "../../types/index.js";

import { isAddressEqual } from "viem";
import { deepFreeze } from "@iris-credit/iris-ts";
import { BundlerAction } from "../../bundler/actions.js";
import {
  NativeAmountExceedsCollateralError,
  NegativeInputError,
  NonPositiveInputError,
  SolverPermit2AmountBelowBondError,
  SolverPermit2AssetMismatchError,
} from "../../types/index.js";
import { getIrisAuthorizationAction } from "../signatures/getIrisAuthorizationAction.js";
import { buildAssetFundingActions } from "./buildAssetFundingActions.js";

/** Parameters for {@link irisTake}. */
export interface IrisTakeParams {
  /** The chain the bundle targets. */
  readonly chainId: ChainId;
  readonly args: {
    /** The solver-signed quote to take. */
    readonly quote: Quote;
    /** The solver's EIP-712 signature over the quote. */
    readonly quoteSignature: Hex;
    /**
     * Optional solver-signed Permit2 payload (spender: the Iris core) delivered off-chain with
     * the quote, submitted in-bundle so the bond pull can flow through Permit2.
     */
    readonly solverPermit2?: SolverPermit2;
    /** Optional pre-signed permit/permit2 approval for the collateral transfer. */
    readonly requirementSignature?: PermitRequirementSignature;
    /**
     * Optional signed Iris authorization granting `GeneralAdapter1` operator rights for
     * `quote.borrower`, folded into the bundle via `setAuthorizationWithSig`.
     */
    readonly authorizationSignature?: AuthorizationRequirementSignature;
    /**
     * Optional collateral portion paid in the native token and wrapped to wNative in-bundle;
     * the ERC-20 pull covers the remainder (`quote.collateral - nativeAmount`). The collateral
     * token must be the chain's wNative.
     */
    readonly nativeAmount?: bigint;
  };
}

/**
 * Prepares a take transaction opening an Iris loan from a solver-signed quote.
 *
 * Routed through bundler3 via `GeneralAdapter1`, composing the bundle in on-chain execution
 * order:
 *
 * 1. `approve2Iris` — when `solverPermit2` is provided, submits the solver's signed Permit2
 *    allowance (spender: the Iris core) so the bond pull succeeds through the Permit2 fallback.
 * 2. `irisSetAuthorizationWithSig` — when `authorizationSignature` is provided, grants
 *    `GeneralAdapter1` operator rights for the borrower. `Iris.take` requires its caller — the
 *    adapter, in a bundled take — to be authorized by `quote.borrower`, so a bundled take
 *    reverts `Unauthorized` unless the borrower authorized the adapter beforehand or this
 *    signature is included.
 * 3. The collateral funding into the adapter: when `nativeAmount > 0n` (the collateral token
 *    must be the chain's wNative), `nativeTransfer` + `wrapNative` first — the transaction's
 *    `value` carries it — then the ERC-20 remainder: plain `erc20TransferFrom`, `approve2` +
 *    `transferFrom2` for a Permit2 `requirementSignature`, or `permit` + `erc20TransferFrom`
 *    for an EIP-2612 one.
 * 4. `irisTake(quote, quoteSignature)` — the bond is pulled by Iris from the solver directly,
 *    not from the adapter.
 *
 * @param params.chainId - The chain the bundle targets.
 * @param params.args.quote - The solver-signed quote to take.
 * @param params.args.quoteSignature - The solver's signature over the quote.
 * @param params.args.solverPermit2 - Optional solver-signed Permit2 bond funding payload.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval.
 * @param params.args.authorizationSignature - Optional signed Iris authorization for the borrower.
 * @param params.args.nativeAmount - Optional collateral portion paid natively and wrapped in-bundle.
 * @returns A deep-frozen `Transaction<IrisTakeAction>` with `to`, `value`, `data`, and the typed
 *   `action` discriminator.
 * @throws {NonPositiveInputError} when `quote.collateral`, `quote.debt`, or `quote.bond` is not positive.
 * @throws {SolverPermit2AssetMismatchError} when `solverPermit2` is signed for a token other than
 *   `quote.debtToken`.
 * @throws {SolverPermit2AmountBelowBondError} when `solverPermit2` is signed for less than
 *   `quote.bond`.
 * @throws {BundlerErrors.UnexpectedSignature} from `getIrisAuthorizationAction` when
 *   `authorizationSignature.args.authorized` is not the chain's `GeneralAdapter1`.
 * @throws {NegativeInputError} when `nativeAmount` is negative.
 * @throws {NativeAmountExceedsCollateralError} when `nativeAmount` exceeds `quote.collateral`.
 * @throws {NativeAmountOnNonWNativeAssetError} from `buildAssetFundingActions` when
 *   `nativeAmount > 0n` but the collateral token is not the chain's wNative.
 * @throws {DepositAssetMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed asset differs from `quote.collateralToken`.
 * @throws {DepositAmountMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed amount differs from the pulled ERC-20 amount
 *   (`quote.collateral - nativeAmount`).
 * @example
 * ```ts
 * import { irisTake } from "@iris-credit/iris-sdk";
 *
 * const tx = irisTake({
 *   chainId: 1,
 *   args: {
 *     quote, // solver-signed quote, delivered through the RFQ
 *     quoteSignature, // delivered with the quote
 *     solverPermit2, // optional — solver bond funding, delivered with the quote
 *     requirementSignature, // optional — collateral permit / permit2 the borrower signed
 *     authorizationSignature, // optional — Iris authorization the borrower signed
 *   },
 * });
 * // tx satisfies Readonly<Transaction<IrisTakeAction>>
 * ```
 */
export const irisTake = ({
  chainId,
  args: {
    quote,
    quoteSignature,
    solverPermit2,
    requirementSignature,
    authorizationSignature,
    nativeAmount = 0n,
  },
}: IrisTakeParams): Readonly<Transaction<IrisTakeAction>> => {
  if (quote.collateral <= 0n) throw new NonPositiveInputError("collateral", quote.collateral);
  if (quote.debt <= 0n) throw new NonPositiveInputError("debt", quote.debt);
  if (quote.bond <= 0n) throw new NonPositiveInputError("bond", quote.bond);

  if (nativeAmount < 0n) throw new NegativeInputError("nativeAmount", nativeAmount);
  if (nativeAmount > quote.collateral) {
    throw new NativeAmountExceedsCollateralError(quote.collateral, nativeAmount);
  }

  const actions: Action[] = [];

  if (solverPermit2) {
    const { token, amount } = solverPermit2.permitSingle.details;
    if (!isAddressEqual(token, quote.debtToken)) {
      throw new SolverPermit2AssetMismatchError(quote.debtToken, token);
    }
    if (amount < quote.bond) {
      throw new SolverPermit2AmountBelowBondError(quote.bond, amount);
    }

    actions.push({
      type: "approve2Iris",
      args: [
        quote.solver,
        solverPermit2.permitSingle,
        solverPermit2.signature,
        false /* skipRevert */,
      ],
    });
  }

  if (authorizationSignature) {
    actions.push(getIrisAuthorizationAction(chainId, authorizationSignature));
  }

  actions.push(
    ...buildAssetFundingActions({
      chainId,
      asset: quote.collateralToken,
      erc20Amount: quote.collateral - nativeAmount,
      nativeAmount,
      requirementSignature,
    }),
    {
      type: "irisTake",
      args: [quote, quoteSignature, false /* skipRevert */],
    },
  );

  const tx = BundlerAction.encodeBundle(chainId, actions);

  return deepFreeze({
    ...tx,
    action: {
      type: "irisTake",
      // Copied so the freeze below cannot reach the caller's quote.
      // Shallow copy suffices because every Quote field is a primitive.
      args: { quote: { ...quote }, quoteSignature },
    },
  });
};

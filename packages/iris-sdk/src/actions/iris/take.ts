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
import { getChainAddresses } from "@iris-credit/core-sdk";
import { deepFreeze } from "@iris-credit/iris-ts";
import { BundlerAction } from "../../bundler/actions.js";
import {
  SolverPermit2AmountBelowBondError,
  SolverPermit2AssetMismatchError,
  ZeroBondAmountError,
  ZeroCollateralAmountError,
  ZeroDebtAmountError,
} from "../../types/index.js";
import { getIrisAuthorizationAction } from "../signatures/getIrisAuthorizationAction.js";
import { getTokenRequirementActions } from "../signatures/getTokenRequirementActions.js";

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
 * 3. The collateral pull into the adapter: plain `erc20TransferFrom`, `approve2` +
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
 * @returns A deep-frozen `Transaction<IrisTakeAction>` with `to`, `value`, `data`, and the typed
 *   `action` discriminator.
 * @throws {ZeroCollateralAmountError} when `quote.collateral` is zero.
 * @throws {ZeroDebtAmountError} when `quote.debt` is zero.
 * @throws {ZeroBondAmountError} when `quote.bond` is zero.
 * @throws {SolverPermit2AssetMismatchError} when `solverPermit2` is signed for a token other than
 *   `quote.debtToken`.
 * @throws {SolverPermit2AmountBelowBondError} when `solverPermit2` is signed for less than
 *   `quote.bond`.
 * @throws {BundlerErrors.UnexpectedSignature} from `getIrisAuthorizationAction` when
 *   `authorizationSignature.args.authorized` is not the chain's `GeneralAdapter1`.
 * @throws {DepositAssetMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed asset differs from `quote.collateralToken`.
 * @throws {DepositAmountMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed amount differs from `quote.collateral`.
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
  args: { quote, quoteSignature, solverPermit2, requirementSignature, authorizationSignature },
}: IrisTakeParams): Readonly<Transaction<IrisTakeAction>> => {
  if (quote.collateral <= 0n) throw new ZeroCollateralAmountError(quote.collateralToken);
  if (quote.debt <= 0n) throw new ZeroDebtAmountError(quote.debtToken);
  if (quote.bond <= 0n) throw new ZeroBondAmountError(quote.debtToken);

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

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
    ...getTokenRequirementActions({
      asset: quote.collateralToken,
      amount: quote.collateral,
      recipient: generalAdapter1,
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
      args: { quote, quoteSignature },
    },
  });
};

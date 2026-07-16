import type { Hex } from "viem";
import type { ChainId, Quote } from "@iris-credit/core-sdk";
import type { Action } from "../../bundler/type.js";
import type { IrisTakeAction, PermitRequirementSignature, Transaction } from "../../types/index.js";

import { getChainAddresses } from "@iris-credit/core-sdk";
import { deepFreeze } from "@iris-credit/iris-ts";
import { BundlerAction } from "../../bundler/actions.js";
import {
  ZeroBondAmountError,
  ZeroCollateralAmountError,
  ZeroDebtAmountError,
} from "../../types/index.js";
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
    /** Optional pre-signed Permit2 approval for the collateral transfer. */
    readonly requirementSignature?: PermitRequirementSignature;
  };
}

/**
 * Prepares a take transaction opening an Iris loan from a solver-signed quote.
 *
 * Routed through bundler3 via `GeneralAdapter1`: the bundle pulls `quote.collateral` of
 * `quote.collateralToken` from the initiator into the adapter (plain `erc20TransferFrom`, or
 * `approve2` + `transferFrom2` when a Permit2 `requirementSignature` is provided), then calls
 * `irisTake(quote, quoteSignature)`. The bond is pulled by Iris from the solver directly and no
 * Iris authorization is needed: taking opens a new loan and the collateral is paid by the bundle.
 *
 * @param params.chainId - The chain the bundle targets.
 * @param params.args.quote - The solver-signed quote to take.
 * @param params.args.quoteSignature - The solver's signature over the quote.
 * @param params.args.requirementSignature - Optional pre-signed Permit2 approval.
 * @returns A deep-frozen `Transaction<IrisTakeAction>` with `to`, `value`, `data`, and the typed
 *   `action` discriminator.
 * @throws {ZeroCollateralAmountError} when `quote.collateral` is zero.
 * @throws {ZeroDebtAmountError} when `quote.debt` is zero.
 * @throws {ZeroBondAmountError} when `quote.bond` is zero.
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
 *   args: { quote, quoteSignature },
 * });
 * // tx satisfies Readonly<Transaction<IrisTakeAction>>
 * ```
 */
export const irisTake = ({
  chainId,
  args: { quote, quoteSignature, requirementSignature },
}: IrisTakeParams): Readonly<Transaction<IrisTakeAction>> => {
  if (quote.collateral <= 0n) {
    throw new ZeroCollateralAmountError(quote.collateralToken);
  }

  if (quote.debt <= 0n) {
    throw new ZeroDebtAmountError(quote.debtToken);
  }

  if (quote.bond <= 0n) {
    throw new ZeroBondAmountError(quote.debtToken);
  }

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const actions: Action[] = [
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
  ];

  const tx = BundlerAction.encodeBundle(chainId, actions);

  return deepFreeze({
    ...tx,
    action: {
      type: "irisTake",
      args: { quote, quoteSignature },
    },
  });
};

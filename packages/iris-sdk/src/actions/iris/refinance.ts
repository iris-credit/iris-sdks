import type { Address, Hex } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type { Action } from "../../bundler/type.js";
import type {
  AuthorizationRequirementSignature,
  DepositAmountArgs,
  IrisRefinanceAction,
  PermitRequirementSignature,
  Transaction,
} from "../../types/index.js";

import { maxUint256 } from "viem";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { deepFreeze } from "@iris-credit/iris-ts";
import { BundlerAction } from "../../bundler/actions.js";
import { NegativeInputError, NonPositiveInputError } from "../../types/index.js";
import { getIrisAuthorizationAction } from "../signatures/getIrisAuthorizationAction.js";
import { buildAssetFundingActions } from "./buildAssetFundingActions.js";

/** Parameters for {@link irisRefinance}. */
export interface IrisRefinanceParams {
  /** The chain the bundle targets. */
  readonly chainId: ChainId;
  readonly args: DepositAmountArgs & {
    /** Pod identifying the loan to refinance. */
    readonly pod: Address;
    /** The loan's debt token — the asset funded into the adapter to clear the current venue debt. */
    readonly token: Address;
    /** The account receiving the new venue's borrow proceeds and the skimmed residual. */
    readonly receiver: Address;
    /** The id of the venue to refinance to. */
    readonly newVenueId: bigint;
    /** The new venue's market data. */
    readonly data: Hex;
    /** Optional pre-signed permit/permit2 approval for the ERC-20 debt transfer. */
    readonly requirementSignature?: PermitRequirementSignature;
    /**
     * Optional signed Iris authorization granting `GeneralAdapter1` operator rights for the
     * loan's solver, folded into the bundle via `setAuthorizationWithSig`.
     */
    readonly authorizationSignature?: AuthorizationRequirementSignature;
  };
}

/**
 * Prepares a refinance transaction moving an Iris loan's position to another venue.
 *
 * Routed through bundler3 via `GeneralAdapter1`, composing the bundle in on-chain execution
 * order:
 *
 * 1. `irisSetAuthorizationWithSig` — when `authorizationSignature` is provided, grants
 *    `GeneralAdapter1` operator rights for the solver. `Iris.refinance` requires its caller — the
 *    adapter, in a bundled refinance — to be authorized by the loan's solver, so a bundled
 *    refinance reverts `Unauthorized` unless the solver authorized the adapter beforehand or this
 *    signature is included.
 * 2. The debt funding into the adapter: `nativeTransfer` + `wrapNative` for a `nativeAmount`, then
 *    the ERC-20 pull. Iris clears the current venue debt out of the adapter's balance before the
 *    new venue is entered, so the funding cannot come from the refinance itself.
 * 3. `irisRefinance(pod, receiver, newVenueId, data)` — the pod exits its venue and enters the new
 *    one with the same assets, whose borrow proceeds go to `receiver`, making the funding whole.
 * 4. `erc20Transfer(token, receiver, maxUint256)` — skims the residual back to `receiver`. Only the
 *    chain knows the venue debt at execution, so the funding is an upper-bound estimate and the
 *    adapter is left holding the difference.
 *
 * @param params.chainId - The chain the bundle targets.
 * @param params.args.pod - Pod identifying the loan to refinance.
 * @param params.args.token - The loan's debt token.
 * @param params.args.receiver - The account receiving the borrow proceeds and the residual.
 * @param params.args.amount - ERC-20 debt token to pull from the payer, an upper bound on the venue
 *   debt. At least one of `amount` or `nativeAmount` must be positive. Defaults to `0n`.
 * @param params.args.nativeAmount - Optional funding paid in the native token and wrapped
 *   in-bundle; `token` must be the chain's wNative.
 * @param params.args.newVenueId - The id of the venue to refinance to.
 * @param params.args.data - The new venue's market data.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval.
 * @param params.args.authorizationSignature - Optional signed Iris authorization for the solver.
 * @returns A deep-frozen `Transaction<IrisRefinanceAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator.
 * @throws {NegativeInputError} when `amount` or `nativeAmount` is negative.
 * @throws {NonPositiveInputError} when `amount` and `nativeAmount` both resolve to zero.
 * @throws {NativeAmountOnNonWNativeAssetError} from `buildAssetFundingActions` when
 *   `nativeAmount > 0n` but `token` is not the chain's wNative.
 * @throws {BundlerErrors.UnexpectedSignature} from `getIrisAuthorizationAction` when
 *   `authorizationSignature.args.authorized` is not the chain's `GeneralAdapter1`.
 * @throws {DepositAssetMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed asset differs from `token`.
 * @throws {DepositAmountMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed amount differs from `amount`.
 * @example
 * ```ts
 * import { irisRefinance } from "@iris-credit/iris-sdk";
 *
 * const tx = irisRefinance({
 *   chainId: 1,
 *   args: {
 *     pod, // the loan's pod
 *     token: debtToken, // the loan's debt token
 *     receiver: solver,
 *     amount: venueDebt, // upper bound; the residual is skimmed back
 *     newVenueId: 1n,
 *     data, // the new venue's market data
 *   },
 * });
 * // tx satisfies Readonly<Transaction<IrisRefinanceAction>>
 * ```
 */
export const irisRefinance = ({
  chainId,
  args: {
    pod,
    token,
    receiver,
    amount = 0n,
    nativeAmount,
    newVenueId,
    data,
    requirementSignature,
    authorizationSignature,
  },
}: IrisRefinanceParams): Readonly<Transaction<IrisRefinanceAction>> => {
  if (amount < 0n) throw new NegativeInputError("amount", amount);
  if (nativeAmount !== undefined && nativeAmount < 0n) {
    throw new NegativeInputError("nativeAmount", nativeAmount);
  }

  const transferAmount = amount + (nativeAmount ?? 0n);

  if (transferAmount === 0n) throw new NonPositiveInputError("transferAmount", transferAmount);

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const actions: Action[] = [];

  if (authorizationSignature) {
    actions.push(getIrisAuthorizationAction(chainId, authorizationSignature));
  }

  actions.push(
    ...buildAssetFundingActions({
      chainId,
      asset: token,
      erc20Amount: amount,
      nativeAmount: nativeAmount ?? 0n,
      requirementSignature,
    }),
    {
      type: "irisRefinance",
      args: [pod, receiver, newVenueId, data, false /* skipRevert */],
    },
    // Skim the residual debt tokens back to the receiver: the pull takes the venue debt as it
    // stands onchain, which the funded upper bound overshoots.
    {
      type: "erc20Transfer",
      args: [token, receiver, maxUint256, generalAdapter1, false /* skipRevert */],
    },
  );

  const tx = BundlerAction.encodeBundle(chainId, actions);

  return deepFreeze({
    ...tx,
    action: {
      type: "irisRefinance",
      args: { pod, token, transferAmount, receiver, newVenueId, data, nativeAmount },
    },
  });
};

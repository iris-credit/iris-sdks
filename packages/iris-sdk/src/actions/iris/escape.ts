import type { Address } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type { Action } from "../../bundler/type.js";
import type {
  AuthorizationRequirementSignature,
  IrisEscapeAction,
  PermitRequirementSignature,
  Transaction,
} from "../../types/index.js";

import { isAddressEqual, maxUint256, zeroAddress } from "viem";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { deepFreeze } from "@iris-credit/iris-ts";
import { BundlerAction } from "../../bundler/actions.js";
import { NegativeInputError, ZeroAddressError } from "../../types/index.js";
import { getIrisAuthorizationAction } from "../signatures/getIrisAuthorizationAction.js";
import { buildAssetFundingActions } from "./buildAssetFundingActions.js";

/** Parameters for {@link irisEscape}. */
export interface IrisEscapeParams {
  /** The chain the bundle targets. */
  readonly chainId: ChainId;
  readonly args: {
    /** Pod identifying the resolved loan whose venue position is exited. */
    readonly pod: Address;
    /** The loan's debt token — the asset the venue debt is settled in. */
    readonly token: Address;
    /** The account receiving the venue collateral and the residual debt token. */
    readonly receiver: Address;
    /**
     * ERC-20 debt token to pull from the payer, an upper bound on the venue debt. Defaults to
     * `0n`; unlike the supply paths' `DepositAmountArgs`, funding nothing is valid here — a venue
     * repaid in full leaves escape a pure collateral withdrawal.
     */
    readonly amount?: bigint;
    /** Optional debt paid in the native token and wrapped in-bundle; `token` must be wNative. */
    readonly nativeAmount?: bigint;
    /** Optional pre-signed permit/permit2 approval for the ERC-20 debt transfer. */
    readonly requirementSignature?: PermitRequirementSignature;
    /**
     * Optional signed Iris authorization granting `GeneralAdapter1` operator rights for the
     * borrower, folded into the bundle via `setAuthorizationWithSig`.
     */
    readonly authorizationSignature?: AuthorizationRequirementSignature;
  };
}

/**
 * Prepares an escape transaction exiting the venue position of a resolved Iris loan.
 *
 * Routed through bundler3 via `GeneralAdapter1`, composing the bundle in on-chain execution order:
 *
 * 1. `irisSetAuthorizationWithSig` — when `authorizationSignature` is provided, grants
 *    `GeneralAdapter1` operator rights for the borrower. `Iris.escape` requires its caller — the
 *    adapter, in a bundled escape — to be authorized by the borrower, so a bundled escape reverts
 *    `Unauthorized` unless the borrower authorized the adapter beforehand or this signature is
 *    included.
 * 2. The debt funding into the adapter, when the venue still carries debt: `nativeTransfer` +
 *    `wrapNative` for a `nativeAmount`, then the ERC-20 pull.
 * 3. `irisEscape(pod, receiver)` — the adapter approves Iris and Iris pulls the venue debt from it,
 *    exits the venue, and sends the collateral, yield included, to `receiver`.
 * 4. `erc20Transfer(token, receiver, maxUint256)` — skims the residual back to `receiver`. Only the
 *    chain knows the venue debt at execution, so `amount` is an upper-bound estimate and the
 *    adapter is left holding the difference.
 *
 * Repay and liquidation repay the venue in full, leaving nothing to fund — escape is then a pure
 * collateral withdrawal. A bond liquidation only repays the venue up to the slashed bond, so it is
 * the one that leaves venue debt for the borrower to cover, accruing at the venue's floating rate
 * until they do.
 *
 * @param params.chainId - The chain the bundle targets.
 * @param params.args.pod - Pod identifying the resolved loan to exit.
 * @param params.args.token - The loan's debt token.
 * @param params.args.receiver - The account receiving the venue collateral and the residual.
 * @param params.args.amount - ERC-20 debt token to pull from the payer. Defaults to `0n`.
 * @param params.args.nativeAmount - Optional debt paid natively and wrapped in-bundle.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval.
 * @param params.args.authorizationSignature - Optional signed Iris authorization for the borrower.
 * @returns A deep-frozen `Transaction<IrisEscapeAction>` with `to`, `value`, `data`, and the typed
 *   `action` discriminator.
 * @throws {ZeroAddressError} when `receiver` is the zero address.
 * @throws {NegativeInputError} when `amount` or `nativeAmount` is negative.
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
 * import { irisEscape } from "@iris-credit/iris-sdk";
 *
 * const tx = irisEscape({
 *   chainId: 1,
 *   args: {
 *     pod, // the loan's pod
 *     token: debtToken, // the loan's debt token
 *     receiver: borrower,
 *     amount: venueDebt, // upper bound; the residual is skimmed back
 *   },
 * });
 * // tx satisfies Readonly<Transaction<IrisEscapeAction>>
 * ```
 */
export const irisEscape = ({
  chainId,
  args: {
    pod,
    token,
    receiver,
    amount = 0n,
    nativeAmount,
    requirementSignature,
    authorizationSignature,
  },
}: IrisEscapeParams): Readonly<Transaction<IrisEscapeAction>> => {
  if (isAddressEqual(receiver, zeroAddress)) throw new ZeroAddressError("receiver");

  if (amount < 0n) throw new NegativeInputError("amount", amount);
  if (nativeAmount !== undefined && nativeAmount < 0n) {
    throw new NegativeInputError("nativeAmount", nativeAmount);
  }

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);
  const transferAmount = amount + (nativeAmount ?? 0n);

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
      type: "irisEscape",
      args: [pod, receiver, false /* skipRevert */],
    },
  );

  // Skim residual debt tokens back to the receiver, when the bundle funded any.
  if (transferAmount > 0n) {
    actions.push({
      type: "erc20Transfer",
      args: [token, receiver, maxUint256, generalAdapter1, false /* skipRevert */],
    });
  }

  const tx = BundlerAction.encodeBundle(chainId, actions);

  return deepFreeze({
    ...tx,
    action: {
      type: "irisEscape",
      args: { pod, token, transferAmount, receiver, nativeAmount },
    },
  });
};

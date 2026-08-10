import type { Address } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type { Action } from "../../bundler/type.js";
import type {
  AuthorizationRequirementSignature,
  DepositAmountArgs,
  IrisCloseAction,
  PermitRequirementSignature,
  Transaction,
} from "../../types/index.js";

import { isAddressEqual, maxUint256, zeroAddress } from "viem";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { deepFreeze } from "@iris-credit/iris-ts";
import { BundlerAction } from "../../bundler/actions.js";
import { NegativeInputError, NonPositiveInputError, ZeroAddressError } from "../../types/index.js";
import { getIrisAuthorizationAction } from "../signatures/getIrisAuthorizationAction.js";
import { buildAssetFundingActions } from "./buildAssetFundingActions.js";

/** Parameters for {@link irisClose}. */
export interface IrisCloseParams {
  /** The chain the bundle targets. */
  readonly chainId: ChainId;
  readonly args: DepositAmountArgs & {
    /** Pod identifying the loan to repay and exit. */
    readonly pod: Address;
    /** The loan's debt token — the asset the repayment is pulled in. */
    readonly token: Address;
    /** The account receiving the venue collateral and the swept residual. */
    readonly receiver: Address;
    /** Optional pre-signed permit/permit2 approval for the ERC-20 repayment transfer. */
    readonly requirementSignature?: PermitRequirementSignature;
    /**
     * Optional signed Iris authorization granting `GeneralAdapter1` operator rights for the
     * borrower, folded into the bundle via `setAuthorizationWithSig`.
     */
    readonly authorizationSignature?: AuthorizationRequirementSignature;
  };
}

/**
 * Prepares a close transaction resolving an Iris loan and recovering its collateral in one bundle.
 *
 * Routed through bundler3 via `GeneralAdapter1`, composing the bundle in on-chain execution order:
 *
 * 1. `irisSetAuthorizationWithSig` — when `authorizationSignature` is provided. The escape leg runs
 *    on the borrower's Iris authorization of `GeneralAdapter1`, so the bundle reverts
 *    `Unauthorized` unless the borrower granted it beforehand or this signature is included.
 * 2. The repayment funding into the adapter: `nativeTransfer` + `wrapNative` for a `nativeAmount`,
 *    then the ERC-20 pull.
 * 3. `irisRepay(pod, token)` — first: `Iris.escape` rejects a loan that still carries a bond
 *    requirement, and the repayment is what clears it. Iris repays in full at a price that accrues
 *    per second, so `amount + nativeAmount` is an upper bound; under-funding reverts the bundle.
 * 4. `irisEscape(pod, receiver)` — exits the venue position, which the repayment left funded in
 *    full. Escape, not `withdrawCollateral`: it takes the venue balance as it stands at execution,
 *    where an exact amount a rebase invalidated would revert or strand dust.
 * 5. `erc20Transfer(token, receiver, maxUint256)` — skims the residual back to `receiver`.
 *
 * `GeneralAdapter1.irisEscape` pins the borrower to the bundle initiator, so unlike the
 * permissionless {@link irisRepay} this bundle may only be sent by the borrower.
 *
 * @param params.chainId - The chain the bundle targets.
 * @param params.args.pod - Pod identifying the loan to repay and exit.
 * @param params.args.token - The loan's debt token.
 * @param params.args.receiver - The account receiving the venue collateral and the swept residual.
 * @param params.args.amount - ERC-20 debt token to pull from the payer. At least one of `amount`
 *   or `nativeAmount` must be positive. Defaults to `0n`.
 * @param params.args.nativeAmount - Optional funding paid in the native token and wrapped
 *   in-bundle; the debt token must be the chain's wNative. Anything the repayment does not
 *   consume is swept back as wNative, not unwrapped.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval.
 * @param params.args.authorizationSignature - Optional signed Iris authorization for the borrower.
 * @returns A deep-frozen `Transaction<IrisCloseAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator.
 * @throws {ZeroAddressError} when `receiver` is the zero address.
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
 * import { irisClose } from "@iris-credit/iris-sdk";
 *
 * const tx = irisClose({
 *   chainId: 1,
 *   args: {
 *     pod, // the loan's pod
 *     token: debtToken, // the loan's debt token
 *     amount: 1_010_000n, // upper bound on what the loan owes at execution
 *     receiver: borrower, // takes the collateral and what the repayment did not consume
 *   },
 * });
 * // tx satisfies Readonly<Transaction<IrisCloseAction>>
 * ```
 */
export const irisClose = ({
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
}: IrisCloseParams): Readonly<Transaction<IrisCloseAction>> => {
  if (isAddressEqual(receiver, zeroAddress)) throw new ZeroAddressError("receiver");

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
    // Repay first: escape rejects a loan whose bond requirement the repayment has not cleared.
    {
      type: "irisRepay",
      args: [pod, token, false /* skipRevert */],
    },
    {
      type: "irisEscape",
      args: [pod, receiver, false /* skipRevert */],
    },
    // Skim residual debt tokens back to the receiver.
    {
      type: "erc20Transfer",
      args: [token, receiver, maxUint256, generalAdapter1, false /* skipRevert */],
    },
  );

  const tx = BundlerAction.encodeBundle(chainId, actions);

  return deepFreeze({
    ...tx,
    action: {
      type: "irisClose",
      args: { pod, token, transferAmount, receiver, nativeAmount },
    },
  });
};

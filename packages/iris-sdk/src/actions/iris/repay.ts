import type { Address } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type {
  DepositAmountArgs,
  IrisRepayAction,
  PermitRequirementSignature,
  Transaction,
} from "../../types/index.js";

import { maxUint256 } from "viem";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { deepFreeze } from "@iris-credit/iris-ts";
import { BundlerAction } from "../../bundler/actions.js";
import { NegativeInputError, NonPositiveInputError } from "../../types/index.js";
import { buildAssetFundingActions } from "./buildAssetFundingActions.js";

/** Parameters for {@link irisRepay}. */
export interface IrisRepayParams {
  /** The chain the bundle targets. */
  readonly chainId: ChainId;
  readonly args: DepositAmountArgs & {
    /** Pod identifying the loan to repay. */
    readonly pod: Address;
    /** The loan's debt token — the asset the repayment is pulled in. */
    readonly token: Address;
    /** The account the swept residual is returned to. */
    readonly receiver: Address;
    /** Optional pre-signed permit/permit2 approval for the ERC-20 repayment transfer. */
    readonly requirementSignature?: PermitRequirementSignature;
  };
}

/**
 * Prepares a repay transaction closing an Iris loan.
 *
 * Routed through bundler3: `buildAssetFundingActions` moves the funding into `GeneralAdapter1`,
 * `irisRepay` lets Iris pull what the loan owes, and a final `erc20Transfer` sweeps the adapter's
 * remaining balance back to `receiver`. Iris always repays in full and prices the debt at
 * execution — the amount owed accrues per second — so `amount + nativeAmount` is an upper bound
 * on the pull rather than the repaid figure: fund a buffer and the sweep returns whatever the
 * pull left behind. Under-funding reverts the bundle. `Iris.repay` is permissionless, so anyone
 * may close the loan on the borrower's behalf and no Iris authorization is folded in.
 *
 * @param params.chainId - The chain the bundle targets.
 * @param params.args.pod - Pod identifying the loan to repay.
 * @param params.args.token - The loan's debt token.
 * @param params.args.receiver - The account the swept residual is returned to.
 * @param params.args.amount - ERC-20 debt token to pull from the payer. At least one of `amount`
 *   or `nativeAmount` must be positive. Defaults to `0n`.
 * @param params.args.nativeAmount - Optional funding paid in the native token and wrapped
 *   in-bundle; the debt token must be the chain's wNative. Anything the repayment does not
 *   consume is swept back as wNative, not unwrapped.
 * @param params.args.requirementSignature - Optional pre-signed permit/permit2 approval.
 * @returns A deep-frozen `Transaction<IrisRepayAction>` with `to`, `value`, `data`, and the typed
 *   `action` discriminator.
 * @throws {NegativeInputError} when `amount` or `nativeAmount` is negative.
 * @throws {NonPositiveInputError} when `amount` and `nativeAmount` both resolve to zero.
 * @throws {NativeAmountOnNonWNativeAssetError} from `buildAssetFundingActions` when
 *   `nativeAmount > 0n` but `token` is not the chain's wNative.
 * @throws {DepositAssetMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed asset differs from `token`.
 * @throws {DepositAmountMismatchError} from `getTokenRequirementActions` when `requirementSignature`
 *   is provided and the signed amount differs from `amount`.
 * @example
 * ```ts
 * import { irisRepay } from "@iris-credit/iris-sdk";
 *
 * const tx = irisRepay({
 *   chainId: 1,
 *   args: {
 *     pod, // the loan's pod
 *     token: debtToken, // the loan's debt token
 *     amount: 1_010_000n, // upper bound on what the loan owes at execution
 *     receiver: borrower, // takes back what the repayment did not consume
 *   },
 * });
 * // tx satisfies Readonly<Transaction<IrisRepayAction>>
 * ```
 */
export const irisRepay = ({
  chainId,
  args: { pod, token, receiver, amount = 0n, nativeAmount, requirementSignature },
}: IrisRepayParams): Readonly<Transaction<IrisRepayAction>> => {
  if (amount < 0n) throw new NegativeInputError("amount", amount);
  if (nativeAmount !== undefined && nativeAmount < 0n) {
    throw new NegativeInputError("nativeAmount", nativeAmount);
  }

  const transferAmount = amount + (nativeAmount ?? 0n);

  if (transferAmount === 0n) throw new NonPositiveInputError("transferAmount", transferAmount);

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const actions = buildAssetFundingActions({
    chainId,
    asset: token,
    erc20Amount: amount,
    nativeAmount: nativeAmount ?? 0n,
    requirementSignature,
  });

  actions.push(
    {
      type: "irisRepay",
      args: [pod, token, false /* skipRevert */],
    },
    // Skim residual loan tokens back to the payer.
    {
      type: "erc20Transfer",
      args: [token, receiver, maxUint256, generalAdapter1, false /* skipRevert */],
    },
  );

  const tx = BundlerAction.encodeBundle(chainId, actions);

  return deepFreeze({
    ...tx,
    action: {
      type: "irisRepay",
      args: { pod, token, transferAmount, receiver, nativeAmount },
    },
  });
};

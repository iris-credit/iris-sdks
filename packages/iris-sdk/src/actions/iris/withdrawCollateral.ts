import type { Address } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type { IrisWithdrawCollateralAction, Transaction } from "../../types/index.js";

import { encodeFunctionData } from "viem";
import { getChainAddresses, irisAbi } from "@iris-credit/core-sdk";
import { deepFreeze } from "@iris-credit/iris-ts";
import { NonPositiveInputError } from "../../types/index.js";

/** Parameters for {@link irisWithdrawCollateral}. */
export interface IrisWithdrawCollateralParams {
  /** The chain the transaction targets. */
  readonly chainId: ChainId;
  readonly args: {
    /** Pod identifying the loan whose collateral is withdrawn. */
    readonly pod: Address;
    /** The collateral to withdraw, in the loan's collateral token. */
    readonly amount: bigint;
    /** The account receiving the withdrawn collateral. */
    readonly receiver: Address;
  };
}

/**
 * Prepares a withdraw-collateral transaction withdrawing an Iris loan's collateral.
 *
 * Direct call to `Iris.withdrawCollateral` — no bundler, no `GeneralAdapter1`. The collateral
 * leaves the venue for `receiver`, so there is nothing to fund or sweep in a bundle; routing
 * through the adapter would only add the borrower's adapter authorization as a pre-condition, and
 * the adapter narrows the caller further to the borrower as the bundle initiator.
 *
 * The caller (`msg.sender`) must be the loan's borrower or an account the borrower authorized on
 * Iris. Iris re-checks the position's health after the withdrawal, on the accrued and rebased
 * position — size the amount against `PositionUtils.getWithdrawableCollateral`.
 *
 * @param params.chainId - The chain the transaction targets.
 * @param params.args.pod - Pod identifying the loan whose collateral is withdrawn.
 * @param params.args.amount - The collateral to withdraw.
 * @param params.args.receiver - The account receiving the withdrawn collateral.
 * @returns A deep-frozen `Transaction<IrisWithdrawCollateralAction>` with `to`, `value`, `data`,
 *   and the typed `action` discriminator.
 * @throws {NonPositiveInputError} when `amount` is not positive.
 * @example
 * ```ts
 * import { irisWithdrawCollateral } from "@iris-credit/iris-sdk";
 *
 * const tx = irisWithdrawCollateral({
 *   chainId: 1,
 *   args: {
 *     pod, // the loan's pod
 *     amount: 1_000_000_000_000_000_000n,
 *     receiver: borrower,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<IrisWithdrawCollateralAction>>
 * ```
 */
export const irisWithdrawCollateral = ({
  chainId,
  args: { pod, amount, receiver },
}: IrisWithdrawCollateralParams): Readonly<Transaction<IrisWithdrawCollateralAction>> => {
  if (amount <= 0n) throw new NonPositiveInputError("amount", amount);

  const { iris } = getChainAddresses(chainId);

  const tx = {
    to: iris,
    data: encodeFunctionData({
      abi: irisAbi,
      functionName: "withdrawCollateral",
      args: [pod, amount, receiver],
    }),
    value: 0n,
  };

  return deepFreeze({
    ...tx,
    action: {
      type: "irisWithdrawCollateral",
      args: { pod, amount, receiver },
    },
  });
};

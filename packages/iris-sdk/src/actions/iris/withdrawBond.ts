import type { Address } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type { IrisWithdrawBondAction, Transaction } from "../../types/index.js";

import { encodeFunctionData } from "viem";
import { getChainAddresses, irisAbi } from "@iris-credit/core-sdk";
import { deepFreeze } from "@iris-credit/iris-ts";
import { NonPositiveInputError } from "../../types/index.js";

/** Parameters for {@link irisWithdrawBond}. */
export interface IrisWithdrawBondParams {
  /** The chain the transaction targets. */
  readonly chainId: ChainId;
  readonly args: {
    /** Pod identifying the loan whose bond is withdrawn. */
    readonly pod: Address;
    /** The bond to withdraw, in the loan's debt token. */
    readonly amount: bigint;
    /** The account receiving the withdrawn bond. */
    readonly receiver: Address;
  };
}

/**
 * Prepares a withdraw-bond transaction withdrawing an Iris loan's solver bond.
 *
 * Direct call to `Iris.withdrawBond` — no bundler needed. The bond flows out of Iris to
 * `receiver`, so there is nothing to fund or sweep in a bundle.
 *
 * The caller (`msg.sender`) must be the loan's solver or an account the solver authorized on Iris.
 *
 * @param params.chainId - The chain the transaction targets.
 * @param params.args.pod - Pod identifying the loan whose bond is withdrawn.
 * @param params.args.amount - The bond to withdraw.
 * @param params.args.receiver - The account receiving the withdrawn bond.
 * @returns A deep-frozen `Transaction<IrisWithdrawBondAction>` with `to`, `value`, `data`, and the
 *   typed `action` discriminator.
 * @throws {NonPositiveInputError} when `amount` is not positive.
 * @example
 * ```ts
 * import { irisWithdrawBond } from "@iris-credit/iris-sdk";
 *
 * const tx = irisWithdrawBond({
 *   chainId: 1,
 *   args: {
 *     pod, // the loan's pod
 *     amount: 1_000_000n,
 *     receiver: solver,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<IrisWithdrawBondAction>>
 * ```
 */
export const irisWithdrawBond = ({
  chainId,
  args: { pod, amount, receiver },
}: IrisWithdrawBondParams): Readonly<Transaction<IrisWithdrawBondAction>> => {
  if (amount <= 0n) throw new NonPositiveInputError("amount", amount);

  const { iris } = getChainAddresses(chainId);

  let tx = {
    to: iris,
    data: encodeFunctionData({
      abi: irisAbi,
      functionName: "withdrawBond",
      args: [pod, amount, receiver],
    }),
    value: 0n,
  };

  return deepFreeze({
    ...tx,
    action: {
      type: "irisWithdrawBond",
      args: { pod, amount, receiver },
    },
  });
};

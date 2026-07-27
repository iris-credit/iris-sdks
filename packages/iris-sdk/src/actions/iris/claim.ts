import type { Address } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type { IrisClaimAction, Transaction } from "../../types/index.js";

import { encodeFunctionData } from "viem";
import { getChainAddresses, irisAbi } from "@iris-credit/core-sdk";
import { deepFreeze } from "@iris-credit/iris-ts";
import { NonPositiveInputError } from "../../types/index.js";

/** Parameters for {@link irisClaim}. */
export interface IrisClaimParams {
  /** The chain the transaction targets. */
  readonly chainId: ChainId;
  readonly args: {
    /** The token the claimable balance is denominated in. */
    readonly token: Address;
    /** The amount to claim, debited from `onBehalf`'s claimable balance. */
    readonly amount: bigint;
    /** The account whose claimable balance is drawn down. */
    readonly onBehalf: Address;
    /** The account receiving the claimed tokens. */
    readonly receiver: Address;
  };
}

/**
 * Prepares a claim transaction drawing down an account's claimable Iris balance.
 *
 * Direct call to `Iris.claim` — no bundler, no `GeneralAdapter1`. The tokens leave Iris for
 * `receiver`, so there is nothing to fund or sweep in a bundle; routing through the adapter would
 * only pin `onBehalf` to the bundle initiator and add that initiator's adapter authorization as a
 * pre-condition.
 *
 * The caller (`msg.sender`) must be `onBehalf` or an account they authorized on Iris.
 *
 * @param params.chainId - The chain the transaction targets.
 * @param params.args.token - The token the claimable balance is denominated in.
 * @param params.args.amount - The amount to claim.
 * @param params.args.onBehalf - The account whose claimable balance is drawn down.
 * @param params.args.receiver - The account receiving the claimed tokens.
 * @returns A deep-frozen `Transaction<IrisClaimAction>` with `to`, `value`, `data`, and the typed
 *   `action` discriminator.
 * @throws {NonPositiveInputError} when `amount` is not positive.
 * @example
 * ```ts
 * import { irisClaim } from "@iris-credit/iris-sdk";
 *
 * const tx = irisClaim({
 *   chainId: 1,
 *   args: {
 *     token: debtToken, // the token the claimable balance is denominated in
 *     amount: 1_000_000n,
 *     onBehalf: solver,
 *     receiver: solver,
 *   },
 * });
 * // tx satisfies Readonly<Transaction<IrisClaimAction>>
 * ```
 */
export const irisClaim = ({
  chainId,
  args: { token, amount, onBehalf, receiver },
}: IrisClaimParams): Readonly<Transaction<IrisClaimAction>> => {
  if (amount <= 0n) throw new NonPositiveInputError("amount", amount);

  const { iris } = getChainAddresses(chainId);

  const tx = {
    to: iris,
    data: encodeFunctionData({
      abi: irisAbi,
      functionName: "claim",
      args: [token, amount, onBehalf, receiver],
    }),
    value: 0n,
  };

  return deepFreeze({
    ...tx,
    action: {
      type: "irisClaim",
      args: { token, amount, onBehalf, receiver },
    },
  });
};

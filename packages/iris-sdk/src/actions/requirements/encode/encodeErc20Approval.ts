import type { Address } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type { ERC20ApprovalAction, Transaction } from "../../../types/index.js";

import { encodeFunctionData, erc20Abi, isAddressEqual, maxUint256 } from "viem";
import { getChainAddresses, MathLib } from "@iris-credit/core-sdk";
import { deepFreeze, entries } from "@iris-credit/iris-ts";
import { MAX_TOKEN_APPROVALS } from "../../../helpers/index.js";
import { UnsupportedErc20ApprovalSpenderError } from "../../../types/index.js";

/** Parameters for {@link encodeErc20Approval}. */
interface EncodeErc20ApprovalParams {
  token: Address;
  spender: Address;
  amount: bigint;
  chainId: ChainId;
}

/**
 * Encodes a deep-frozen ERC-20 approval transaction for GeneralAdapter1, Permit2, or the Iris core.
 *
 * Caps `amount` at the per-chain, per-token maximum from `MAX_TOKEN_APPROVALS` (defaults to
 * `maxUint256`). Used by {@link getRequirementsApproval} and {@link getGeneralAdapterRequirementsPermit2}.
 *
 * @param params - Encoding parameters.
 * @param params.token - ERC-20 token address to approve.
 * @param params.spender - Address granted the allowance. Must be GeneralAdapter1, Permit2, or the
 *   Iris core — the closed set of protocol spenders, so a requirement can never approve an
 *   arbitrary address.
 * @param params.amount - Allowance amount before per-token cap.
 * @param params.chainId - The chain the transaction targets (used to resolve supported spenders and the per-token cap).
 * @returns A deep-frozen `Transaction<ERC20ApprovalAction>` with the capped approval amount.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not GeneralAdapter1, Permit2, or the Iris core for `chainId`.
 * @example
 * ```ts
 * import { encodeErc20Approval } from "@iris-credit/iris-sdk";
 *
 * const tx = encodeErc20Approval({
 *   token: USDC,
 *   spender: generalAdapter1,
 *   amount: 1_000_000n,
 *   chainId: 1,
 * });
 * // tx satisfies Readonly<Transaction<ERC20ApprovalAction>>
 * ```
 */
export const encodeErc20Approval = (
  params: EncodeErc20ApprovalParams,
): Transaction<ERC20ApprovalAction> => {
  const { token, spender, amount, chainId } = params;
  const {
    iris,
    permit2,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  if (
    !isAddressEqual(spender, generalAdapter1) &&
    !isAddressEqual(spender, iris) &&
    (permit2 == null || !isAddressEqual(spender, permit2))
  ) {
    throw new UnsupportedErc20ApprovalSpenderError({
      spender,
      chainId,
      generalAdapter1,
      permit2,
      supportedSpenders: [generalAdapter1, permit2, iris],
    });
  }

  const amountValue = MathLib.min(
    amount,
    entries(MAX_TOKEN_APPROVALS[chainId]).find(([entry]) => isAddressEqual(entry, token))?.[1] ??
      maxUint256,
  );

  return deepFreeze({
    to: token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amountValue],
    }),
    value: 0n,
    action: {
      type: "erc20Approval" as const,
      args: { spender, amount: amountValue },
    },
  });
};

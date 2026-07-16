import type { Address } from "viem";
import type { Action } from "../../bundler/index.js";
import type { PermitRequirementSignature } from "../../types/index.js";

import { isAddressEqual } from "viem";
import { DepositAmountMismatchError, DepositAssetMismatchError } from "../../types/index.js";

interface GetTokenRequirementActionsParams {
  asset: Address;
  amount: bigint;
  recipient: Address;
  requirementSignature?: PermitRequirementSignature;
}

/**
 * Encodes the bundler actions that pull the asset to `recipient`, optionally consuming a
 * pre-signed Permit2 requirement first.
 *
 * The Permit2 path emits `approve2` + `transferFrom2`. When no signature is provided, the
 * function emits a plain `erc20TransferFrom` against an existing ERC-20 allowance. EIP-2612
 * permit signatures are not supported (signature-based approvals are Permit2-only).
 *
 * The signed `asset` and `amount` must match the pulled `asset` and `amount` exactly, otherwise
 * the function throws so the caller does not silently spend a wider-than-expected approval.
 *
 * @param params.asset - The ERC-20 to pull.
 * @param params.amount - The amount to pull, in the asset's smallest unit.
 * @param params.recipient - The address that receives the transfer.
 * @param params.requirementSignature - Optional signed permit2 to apply before the transfer.
 * @returns Bundler `Action`s needed to pull the token.
 * @throws {DepositAssetMismatchError} when the signed asset differs from `asset`.
 * @throws {DepositAmountMismatchError} when the signed amount differs from `amount`.
 * @example
 * ```ts
 * import { getTokenRequirementActions } from "@iris-credit/iris-sdk";
 *
 * // `requirement` comes from a requirement helper; signing produces a `RequirementSignature`.
 * const requirementSignature = await requirement.sign(walletClient, borrower);
 *
 * const actions = getTokenRequirementActions({
 *   asset: collateralToken,
 *   amount: 1_000_000n,
 *   recipient: generalAdapter1,
 *   requirementSignature,
 * });
 * // actions satisfies Action[]
 * // - permit2 path: [{ type: "approve2", ... }, { type: "transferFrom2", ... }]
 * // - no signature: [{ type: "erc20TransferFrom", ... }]
 * ```
 */
export const getTokenRequirementActions = ({
  asset,
  amount,
  recipient,
  requirementSignature,
}: GetTokenRequirementActionsParams): Action[] => {
  if (requirementSignature == null) {
    return [
      {
        type: "erc20TransferFrom",
        args: [asset, amount, recipient, false /* skipRevert */],
      },
    ];
  }

  if (!isAddressEqual(requirementSignature.args.asset, asset)) {
    throw new DepositAssetMismatchError(asset, requirementSignature.args.asset);
  }

  // Permit2 overwrites the previous allowance with the signed amount.
  // It must exactly cover the transfer: less would fail, more would leave residual allowance.
  if (requirementSignature.args.amount !== amount) {
    throw new DepositAmountMismatchError(amount, requirementSignature.args.amount);
  }

  return [
    {
      type: "approve2",
      args: [
        requirementSignature.args.owner,
        {
          details: {
            token: requirementSignature.args.asset,
            amount: requirementSignature.args.amount,
            nonce: Number(requirementSignature.args.nonce),
            expiration: Number(requirementSignature.args.expiration),
          },
          sigDeadline: requirementSignature.args.deadline,
        },
        requirementSignature.args.signature,
        false /* skipRevert */,
      ],
    },
    {
      type: "transferFrom2",
      args: [asset, amount, recipient, false /* skipRevert */],
    },
  ];
};

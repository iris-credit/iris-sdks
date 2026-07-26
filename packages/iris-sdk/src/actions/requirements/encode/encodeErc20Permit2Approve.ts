import type { Address, Client, WalletClient } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type {
  Permit2Action,
  PermitRequirementSignature,
  Requirement,
} from "../../../types/index.js";

import { signTypedData, verifyTypedData } from "viem/actions";
import { getChainAddresses, getPermit2PermitTypedData, MathLib } from "@iris-credit/core-sdk";
import { deepFreeze, Time } from "@iris-credit/iris-ts";
import { validateUserAddress } from "../../../helpers/index.js";
import { ChainIdMismatchError, InvalidSignatureError } from "../../../types/index.js";

/** Parameters for {@link encodeErc20Permit2Approve}. */
interface EncodeErc20Permit2ApproveParams {
  token: Address;
  amount: bigint;
  chainId: ChainId;
  nonce: bigint;
  expiration?: bigint;
}

/**
 * Builds a Permit2 `Requirement` that, once signed, lets GeneralAdapter1 pull `amount` of `token`
 * via the Permit2 contract.
 *
 * The returned `Requirement.sign()` verifies the signature against the connected account through
 * the client, so ERC-1271 smart-contract wallets are supported — Permit2 itself accepts EIP-1271
 * signatures on-chain. Deadline defaults to two hours from `Time.timestamp()`.
 *
 * @param viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId` (used for
 *   ERC-1271-capable signature verification).
 * @param params - Permit2 encoding parameters.
 * @param params.token - ERC-20 token address.
 * @param params.amount - Permit2 allowance amount (per-call).
 * @param params.chainId - Target chain id.
 * @param params.nonce - The user's current Permit2 nonce for `(token, GeneralAdapter1)`.
 * @param params.expiration - Permit2-managed allowance expiration timestamp.
 * @returns A `Requirement` whose `sign(client, userAddress)` produces the deep-frozen signature.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`.
 * @throws {MissingClientPropertyError} from `sign()` when the client has no `account.address`.
 * @throws {AddressMismatchError} from `sign()` when the client account differs from `userAddress`.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
 * @example
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { encodeErc20Permit2Approve } from "@iris-credit/iris-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const requirement = encodeErc20Permit2Approve(client, {
 *   token: USDC,
 *   amount: 1_000_000n,
 *   chainId: 1,
 *   nonce: 0n,
 *   expiration: 281_474_976_710_655n, // MAX_UINT_48 (2^48 - 1, effectively indefinite)
 * });
 * // requirement satisfies Requirement
 * ```
 */
export const encodeErc20Permit2Approve = (
  viemClient: Client,
  params: EncodeErc20Permit2ApproveParams,
): Requirement<PermitRequirementSignature> => {
  const { token, amount, chainId, nonce, expiration = MathLib.MAX_UINT_48 } = params;

  if (viemClient.chain?.id !== chainId) {
    throw new ChainIdMismatchError(viemClient.chain?.id, chainId);
  }

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const now = Time.timestamp();
  const deadline = now + Time.s.from.h(2n);

  const action: Permit2Action = {
    type: "permit2",
    args: {
      spender: generalAdapter1,
      amount,
      deadline,
      expiration,
    },
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      const account = client.account;
      validateUserAddress(account?.address, userAddress);

      const typedData = getPermit2PermitTypedData(
        {
          erc20: token,
          allowance: amount,
          nonce: Number(nonce),
          deadline,
          spender: generalAdapter1,
          expiration: Number(expiration),
        },
        chainId,
      );
      const signature = await signTypedData(client, {
        ...typedData,
        account,
      });

      const isValid = await verifyTypedData(viemClient, {
        ...typedData,
        address: userAddress,
        signature,
      });

      if (!isValid) {
        throw new InvalidSignatureError();
      }

      return deepFreeze({
        args: {
          owner: userAddress,
          signature,
          deadline,
          amount,
          asset: token,
          expiration,
          nonce,
        },
        action,
      });
    },
  };
};

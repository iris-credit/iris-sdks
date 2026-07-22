import type { Address, Client, WalletClient } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type {
  PermitAction,
  PermitRequirementSignature,
  Requirement,
} from "../../../types/index.js";

import { isAddressEqual, verifyTypedData } from "viem";
import { signTypedData } from "viem/actions";
import { fetchToken, getChainAddresses, getPermitTypedData } from "@iris-credit/core-sdk";
import { deepFreeze, Time } from "@iris-credit/iris-ts";
import { validateUserAddress } from "../../../helpers/index.js";
import {
  ChainIdMismatchError,
  InvalidSignatureError,
  UnsupportedErc20ApprovalSpenderError,
} from "../../../types/index.js";

/** Parameters for {@link encodeErc20Permit}. */
interface EncodeErc20PermitParams {
  token: Address;
  spender: Address;
  amount: bigint;
  chainId: ChainId;
  nonce: bigint;
}

/**
 * Builds an EIP-2612 permit `Requirement` that, once signed, lets a supported SDK spender pull
 * `amount` of `token`.
 *
 * Reads token metadata via `fetchToken`. The returned `Requirement.sign()` produces the EIP-712
 * signature, verifies it against the connected account, and returns a `RequirementSignature`
 * the bundler action helpers can consume. Deadline defaults to two hours from `Time.timestamp()`.
 *
 * @param viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId`.
 * @param params - Permit encoding parameters.
 * @param params.token - ERC-20 token address (must support EIP-2612).
 * @param params.spender - Permit spender. Must be GeneralAdapter1 for the chain.
 * @param params.amount - Permit allowance amount.
 * @param params.chainId - Target chain id.
 * @param params.nonce - The user's current EIP-2612 nonce on `token`.
 * @returns A `Requirement` whose `sign(client, userAddress)` produces the deep-frozen signature.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not GeneralAdapter1 for `chainId`.
 * @throws {MissingClientPropertyError} from `sign()` when the client has no `account.address`.
 * @throws {AddressMismatchError} from `sign()` when the client account differs from `userAddress`.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
 * @example
 * ```ts
 * import { createWalletClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { encodeErc20Permit } from "@iris-credit/iris-sdk";
 *
 * const client = createWalletClient({ chain: mainnet, transport: http() });
 * const requirement = await encodeErc20Permit(client, {
 *   token: USDC, // Must implement standard ERC-2612. DAI is routed through Permit2 by requirement helpers.
 *   spender: generalAdapter1,
 *   amount: 1_000_000n,
 *   chainId: 1,
 *   nonce: 0n,
 * });
 * // requirement satisfies Requirement
 * ```
 */
export const encodeErc20Permit = async (
  viemClient: Client,
  params: EncodeErc20PermitParams,
): Promise<Requirement<PermitRequirementSignature>> => {
  const { token, spender, amount, chainId, nonce } = params;

  if (viemClient.chain?.id !== chainId) {
    throw new ChainIdMismatchError(viemClient.chain?.id, chainId);
  }

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);
  if (!isAddressEqual(spender, generalAdapter1)) {
    throw new UnsupportedErc20ApprovalSpenderError({
      spender,
      chainId,
      generalAdapter1,
      supportedSpenders: [generalAdapter1],
    });
  }

  const now = Time.timestamp();
  const deadline = now + Time.s.from.h(2n);

  const tokenData = await fetchToken(token, viemClient);

  const action: PermitAction = {
    type: "permit",
    args: {
      spender,
      amount,
      deadline,
    },
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      const account = client.account;
      validateUserAddress(account?.address, userAddress);
      const typedData = getPermitTypedData(
        { erc20: tokenData, owner: userAddress, spender, allowance: amount, nonce, deadline },
        chainId,
      );

      const signature = await signTypedData(client, {
        ...typedData,
        account,
      });

      const isValid = await verifyTypedData({
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
          nonce,
        },
        action,
      });
    },
  };
};

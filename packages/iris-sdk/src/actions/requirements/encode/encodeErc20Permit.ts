import type { Address, Client, WalletClient } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type { PermitRequirementSignature, Requirement } from "../../../types/index.js";

import { isAddressEqual, verifyTypedData } from "viem";
import { signTypedData } from "viem/actions";
import { fetchToken, getChainAddresses, getPermitTypedData } from "@iris-credit/core-sdk";
import { deepFreeze, Time } from "@iris-credit/iris-ts";
import { validateChainId, validateUserAddress } from "../../../helpers/index.js";
import {
  InvalidSignatureError,
  UnsupportedErc20ApprovalSpenderError,
} from "../../../types/index.js";

/** Parameters for {@link encodeErc20Permit}. */
interface EncodeErc20PermitParams {
  token: Address;
  /** Account that owns the tokens and signs the permit. */
  owner: Address;
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
 * the bundler action helpers can consume. The requirement's `action.typedData` holds that EIP-712
 * payload so it can be inspected or displayed before signing. Deadline defaults to two hours from
 * `Time.timestamp()`.
 *
 * @param viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId`.
 * @param params - Permit encoding parameters.
 * @param params.token - ERC-20 token address (must support EIP-2612).
 * @param params.owner - Account that owns the tokens and signs the permit.
 * @param params.spender - Permit spender. Must be GeneralAdapter1 for the chain.
 * @param params.amount - Permit allowance amount.
 * @param params.chainId - Target chain id.
 * @param params.nonce - The owner's current EIP-2612 nonce on `token`.
 * @returns A `Requirement` whose `action.typedData` is the EIP-712 payload and whose
 *   `sign(client, userAddress)` produces the deep-frozen signature.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`.
 * @throws {UnsupportedErc20ApprovalSpenderError} when `spender` is not GeneralAdapter1 for `chainId`.
 * @throws {MissingClientPropertyError} from `sign()` when the client has no `account.address`.
 * @throws {AddressMismatchError} from `sign()` when `userAddress` differs from `owner`, or when the
 *   client account differs from `userAddress`.
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
 *   owner,
 *   spender: generalAdapter1,
 *   amount: 1_000_000n,
 *   chainId: 1,
 *   nonce: 0n,
 * });
 * // Inspect the EIP-712 payload, then sign via the requirement:
 * const typedData = requirement.action.typedData;
 * const signed = await requirement.sign(client, owner);
 * ```
 */
export const encodeErc20Permit = async (
  viemClient: Client,
  params: EncodeErc20PermitParams,
): Promise<Requirement<PermitRequirementSignature>> => {
  const { token, owner, spender, amount, chainId, nonce } = params;

  validateChainId(viemClient.chain?.id, chainId);

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

  const typedData = deepFreeze(
    getPermitTypedData(
      { erc20: tokenData, owner, spender, allowance: amount, nonce, deadline },
      chainId,
    ),
  );

  const action: Requirement<PermitRequirementSignature>["action"] = {
    type: "permit",
    args: {
      spender,
      amount,
      deadline,
    },
    typedData,
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      // The permit's owner is fixed at build time (the fetched nonce is owner-specific), so a
      // different signer cannot produce a valid signature for it.
      validateUserAddress(userAddress, owner);
      const account = client.account;
      validateUserAddress(account?.address, userAddress);

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
          owner,
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

import type { Address, TypedDataDefinition } from "viem";
import type { ChainId } from "../chain.js";
import type { Token } from "../modules/token/Token.js";

import { isAddressEqual } from "viem";
import { getChainAddresses } from "../addresses.js";

/** Message fields for ERC-2612 permit typed data. */
export interface PermitArgs {
  erc20: Token;
  owner: Address;
  spender: Address;
  allowance: bigint;
  nonce: bigint;
  deadline: bigint;
}

const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/**
 * Permit signature for ERC20 tokens, following EIP-2612.
 * The permit domain is derived from the token's metadata: `name` comes from the token and
 * `version` follows the common convention — `"2"` for Circle tokens, `"1"` otherwise.
 * Docs: https://eips.ethereum.org/EIPS/eip-2612
 *
 * @param args - The permit message fields and ERC20 token metadata.
 * @param chainId - The expected chain ID for the permit domain.
 * @returns Typed data ready to pass to a wallet for signing.
 * @example
 * ```ts
 * import { getPermitTypedData } from "@iris-credit/core-sdk";
 *
 * const typedData = getPermitTypedData(
 *   {
 *     erc20: token,
 *     owner,
 *     spender,
 *     allowance: 1_000000n,
 *     nonce,
 *     deadline,
 *   },
 *   1,
 * );
 * const signature = await walletClient.signTypedData(typedData);
 * ```
 */
export const getPermitTypedData = (
  { deadline, owner, nonce, spender, erc20, allowance }: PermitArgs,
  chainId: ChainId,
): TypedDataDefinition<typeof permitTypes, "Permit"> => {
  const { tokens } = getChainAddresses(chainId);

  // Circle's EIP-712 domain uses version "2"; other mainstream ERC-2612 tokens use "1".
  const isCirclePermitV2Token = isAddressEqual(erc20.address, tokens.USDC);

  return {
    domain: {
      name: erc20.name,
      version: isCirclePermitV2Token ? "2" : "1",
      chainId,
      verifyingContract: erc20.address,
    },
    types: permitTypes,
    message: {
      owner,
      spender,
      value: allowance,
      nonce,
      deadline,
    },
    primaryType: "Permit",
  };
};

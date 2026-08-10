import type { Address, TypedDataDefinition } from "viem";
import type { Token } from "../modules/token/Token.js";

import { getAddress } from "viem";
import { CHAIN_ADDRESSES } from "../addresses.js";
import { ChainId } from "../chain.js";
import { UnsupportedChainIdError } from "../errors.js";

/** Message fields for ERC-2612 permit typed data. */
export interface PermitArgs {
  erc20: Token;
  owner: Address;
  spender: Address;
  allowance: bigint;
  nonce: bigint;
  deadline: bigint;
}

/** EIP-712 domain `version` values the verified simple-permit tokens sign. */
export type PermitDomainVersion = "1" | "2";

/**
 * Tokens verified for the ERC-2612 simple-permit path, mapped to the EIP-712 domain `version`
 * each one signs. Verify a token against its live `DOMAIN_SEPARATOR()` before adding it, as
 * absent tokens route to Permit2. `VNet` is curated apart from mainnet: FiatTokenV2_1 (cbBTC)
 * freezes its domain separator at initialization, so on a fork it still verifies against
 * chain id 1.
 */
export const SIMPLE_PERMIT_TOKENS = {
  [ChainId.EthMainnet]: {
    [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.USDC]: "2", // FiatTokenV2_2
    [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.cbBTC]: "2", // FiatTokenV2_1
    [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.stETH]: "2", // Lido V2 StETHPermit
    [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.wstETH]: "1",
  },
  [ChainId.VNet]: {
    [CHAIN_ADDRESSES[ChainId.VNet].tokens.USDC]: "2", // FiatTokenV2_2
    [CHAIN_ADDRESSES[ChainId.VNet].tokens.stETH]: "2", // Lido V2 StETHPermit
    [CHAIN_ADDRESSES[ChainId.VNet].tokens.wstETH]: "1",
  },
} as const satisfies Record<ChainId, Readonly<Record<Address, PermitDomainVersion>>>;

/**
 * Returns the verified simple-permit tokens of a chain, mapped to their domain versions.
 *
 * @param chainId - The chain the permit targets.
 * @returns The chain's entry in {@link SIMPLE_PERMIT_TOKENS}.
 */
export const getSimplePermitTokens = (
  chainId: ChainId,
): Readonly<Record<Address, PermitDomainVersion>> => {
  const simplePermitTokens = SIMPLE_PERMIT_TOKENS[chainId];
  if (simplePermitTokens == null) throw new UnsupportedChainIdError(chainId);

  return simplePermitTokens;
};

/**
 * Reads the verified permit domain version of a token.
 *
 * @param token - Token address, in any casing.
 * @param chainId - The chain the permit targets.
 * @returns The version to sign, or `undefined` when the token is not verified on that chain.
 */
export const getPermitDomainVersion = (
  token: Address,
  chainId: ChainId,
): PermitDomainVersion | undefined => getSimplePermitTokens(chainId)[getAddress(token)];

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
 * `version` from {@link SIMPLE_PERMIT_TOKENS}, falling back to the `"1"` most ERC-2612 tokens
 * sign.
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
  return {
    domain: {
      name: erc20.name,
      version: getPermitDomainVersion(erc20.address, chainId) ?? "1",
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

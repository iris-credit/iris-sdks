import type { Address } from "viem";

import { ChainId } from "./chain.js";

/** Address used to replicate an erc20-behaviour for native token.
 *
 * NB: data might differ from expected onchain native token data
 */
export const NATIVE_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// Permit2 is deployed at the same canonical address on every chain.
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Fields guaranteed on every supported chain. Chain-specific addresses
// (protocol integrations, tokens) vary per chain and are inferred from
// CHAIN_ADDRESSES rather than declared here, so a chain that lacks an
// integration simply omits it — no optional `?` fields to null-check.
interface ChainAddressesBase {
  readonly iris: Address;
  readonly blm: Address;
  readonly podImpl: Address;
  readonly whitelistBlm: Address;
  readonly permit2: Address;
  readonly tokens: Readonly<Record<string, Address>>;
}

// Enforces the base shape on every chain while preserving each chain's exact
// addresses (via the `const` type parameter), so `getChainAddresses` returns a
// precise per-chain type instead of widened optionals.
const defineChainAddresses = <const T extends Record<ChainId, ChainAddressesBase>>(
  addresses: T,
): T => addresses;

export const CHAIN_ADDRESSES = defineChainAddresses({
  [ChainId.EthMainnet]: {
    // Iris protocol contracts.
    iris: "0x25d82E76f94d2C3e4F33EbE883199EBf8019f969",
    blm: "0x7d565f551D6022Ae90b5Ee57c22E7482cAf47698",
    podImpl: "0xDdAE7326DBeEBfD4E3C1e16b9333e795861cEABA",
    whitelistBlm: "0x424A350566aAD1c992fdB348FaEb2FB198De9369",
    permit2: PERMIT2_ADDRESS,
    // Protocol integrations.
    aaveV3Adapter: "0x9eB235E787e9Ef2FC107A8d5951e97d19A3e8B7B",
    aaveV3Pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    morphoBlueAdapter: "0x5fE09E7eA6F46296B42146D77f1Eb88F088Bdf8E",
    morphoBlue: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    tokens: {
      USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      stETH: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
      wstETH: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    },
  },
});

/** Addresses for an unspecified chain; only fields common to every chain are
 * accessible without first narrowing the chain id. */
export type ChainAddresses = (typeof CHAIN_ADDRESSES)[ChainId];

export const getChainAddresses = <T extends ChainId>(chainId: T): (typeof CHAIN_ADDRESSES)[T] => {
  return CHAIN_ADDRESSES[chainId];
};

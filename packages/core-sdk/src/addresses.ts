import type { Address } from "viem";

import { getAddress } from "viem";
import { ChainId } from "./chain.js";
import { UnsupportedChainIdError } from "./errors.js";

/** Address used to replicate an erc20-behaviour for native token.
 *
 * NB: data might differ from expected onchain native token data
 */
export const NATIVE_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// Permit2 is deployed at the same canonical address on every chain.
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Multicall3 is deployed at the same canonical address on nearly every chain
// (multicall3.com); chains where it differs (e.g. zkSync-style) override per-entry.
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

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
  readonly multicall3: Address;
  readonly bundler3: Readonly<Record<string, Address>>;
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
    iris: "0x758cD1Bd54715B8DCc5D33968800fC8e87C8695c",
    blm: "0x8cc058689674f0b54820a04b47618df45d04cBcb",
    podImpl: "0xDdAE7326DBeEBfD4E3C1e16b9333e795861cEABA",
    whitelistBlm: "0xe0Ae439c391D8dCf870a3045f09Fe901fE8Ef07B",
    permit2: PERMIT2_ADDRESS,
    multicall3: MULTICALL3_ADDRESS,
    bundler3: {
      bundler3: "0xB99B3D119B5c5334136b0CE4491210C385298014",
      generalAdapter1: "0x1837d3D1A0F8AFB33b137A4133c9A3C494d90876",
    },
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
  [ChainId.VNet]: {
    // Iris protocol contracts.
    iris: "0x758cD1Bd54715B8DCc5D33968800fC8e87C8695c",
    blm: "0x8cc058689674f0b54820a04b47618df45d04cBcb",
    podImpl: "0xDdAE7326DBeEBfD4E3C1e16b9333e795861cEABA",
    whitelistBlm: "0xe0Ae439c391D8dCf870a3045f09Fe901fE8Ef07B",
    permit2: PERMIT2_ADDRESS,
    multicall3: MULTICALL3_ADDRESS,
    bundler3: {
      bundler3: "0xB99B3D119B5c5334136b0CE4491210C385298014",
      generalAdapter1: "0x1837d3D1A0F8AFB33b137A4133c9A3C494d90876",
    },
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
  const chainAddresses = CHAIN_ADDRESSES[chainId];
  if (chainAddresses == null) throw new UnsupportedChainIdError(chainId);

  return chainAddresses;
};

/* Per-chain mapping of wrapped tokens to the token they unwrap to (e.g. for unwrap routing).
 *
 * NB: includes rate-based wrappers like wstETH for routing purposes; `fetchToken` intercepts
 * those before treating mapped tokens as constant-rate wrappers.
 */
const unwrappedTokensMapping = {
  [ChainId.EthMainnet]: {
    [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.WETH]: NATIVE_ADDRESS,
    [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.stETH]: NATIVE_ADDRESS,
    [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.wstETH]:
      CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.stETH,
  },
  [ChainId.VNet]: {
    [CHAIN_ADDRESSES[ChainId.VNet].tokens.WETH]: NATIVE_ADDRESS,
    [CHAIN_ADDRESSES[ChainId.VNet].tokens.stETH]: NATIVE_ADDRESS,
    [CHAIN_ADDRESSES[ChainId.VNet].tokens.wstETH]: CHAIN_ADDRESSES[ChainId.VNet].tokens.stETH,
  },
} as const satisfies Record<ChainId, Readonly<Record<Address, Address>>>;

/** Returns the token `wrappedToken` unwraps to on `chainId` (any casing), or `undefined` if not
 * registered. */
export const getUnwrappedToken = (wrappedToken: Address, chainId: ChainId) => {
  // Widened lookup: `wrappedToken` is an arbitrary probe (see `fetchToken`), not a known key.
  const mapping: Readonly<Record<Address, Address>> = unwrappedTokensMapping[chainId];
  if (mapping == null) throw new UnsupportedChainIdError(chainId);

  // Normalize casing to match the checksummed mapping keys.
  return mapping[getAddress(wrappedToken)];
};

import type { Address } from "viem";

import { getAddress } from "viem";
import { ChainId } from "./chain.js";
import { UnsupportedAaveV3TokenError, UnsupportedChainIdError } from "./errors.js";

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
  // Every evm chain wraps its native token, and `validateNativeAsset` reads this off an
  // unnarrowed chain id, so it is guaranteed rather than inferred per chain.
  readonly wNative: Address;
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
    wNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    bundler3: {
      bundler3: "0xB99B3D119B5c5334136b0CE4491210C385298014",
      generalAdapter1: "0x1837d3D1A0F8AFB33b137A4133c9A3C494d90876",
    },
    // Protocol integrations.
    aaveV3Adapter: "0x9eB235E787e9Ef2FC107A8d5951e97d19A3e8B7B",
    aaveV3Pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    aaveV3Oracle: "0x54586bE62E3c3580375aE3723C145253060Ca0C2",
    morphoBlueAdapter: "0x5fE09E7eA6F46296B42146D77f1Eb88F088Bdf8E",
    morphoBlue: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    adaptiveCurveIrm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    tokens: {
      DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
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
    iris: "0x47e50Fa62E3562EF90Aa578Fb7328C4c85E2D522",
    blm: "0x8657794828D7660A335ABDF2b21DAea4fE369e97",
    podImpl: "0xf8B1Fd75826549DFe0db83deF6d0663C574fa349",
    whitelistBlm: "0x03fB4ACaa91261b4af463cEB21027A203aCEeb42",
    permit2: PERMIT2_ADDRESS,
    multicall3: MULTICALL3_ADDRESS,
    wNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    bundler3: {
      bundler3: "0x3F9bE653328b2610a4028aFC537F191D4d9c9c24",
      generalAdapter1: "0x2bF8D2f82fb24839fd35CF952A7Eafe96A1Ac394",
    },
    // Protocol integrations.
    aaveV3Adapter: "0x7f1bFABb584935e97143631A3b19816853F40bD7",
    aaveV3Pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    aaveV3Oracle: "0x54586bE62E3c3580375aE3723C145253060Ca0C2",
    morphoBlueAdapter: "0x26927E53bbfeE9C3401FFBE838B739dDe08d5Cba",
    morphoBlue: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    adaptiveCurveIrm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    tokens: {
      DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
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
    [CHAIN_ADDRESSES[ChainId.EthMainnet].wNative]: NATIVE_ADDRESS,
    [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.stETH]: NATIVE_ADDRESS,
    [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.wstETH]:
      CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.stETH,
  },
  [ChainId.VNet]: {
    [CHAIN_ADDRESSES[ChainId.VNet].wNative]: NATIVE_ADDRESS,
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

interface AaveV3Tokens {
  readonly aToken: Address;
  readonly variableDebtToken: Address;
}

const MAINNET_AAVE_V3_TOKENS = {
  [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.DAI]: {
    aToken: "0x018008bfb33d285247A21d44E50697654f754e63",
    variableDebtToken: "0xcF8d0c70c850859266f5C338b38F9D663181C314",
  },
  [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.USDC]: {
    aToken: "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c",
    variableDebtToken: "0x72E95b8931767C79bA4EeE721354d6E99a61D004",
  },
  [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.USDT]: {
    aToken: "0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a",
    variableDebtToken: "0x6df1C1E379bC5a00a7b4C6e67A203333772f45A8",
  },
  [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.WBTC]: {
    aToken: "0x5Ee5bf7ae06D1Be5997A1A72006FE6C607eC6DE8",
    variableDebtToken: "0x40aAbEf1aa8f0eEc637E0E7d92fbfFB2F26A8b7B",
  },
  [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.cbBTC]: {
    aToken: "0x5c647cE0Ae10658ec44FA4E11A51c96e94efd1Dd",
    variableDebtToken: "0xeB284A70557EFe3591b9e6D9D720040E02c54a4d",
  },
  [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.WETH]: {
    aToken: "0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8",
    variableDebtToken: "0xeA51d7853EEFb32b6ee06b1C12E6dcCA88Be0fFE",
  },
  [CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.wstETH]: {
    aToken: "0x0B925eD163218f6662a35e0f0371Ac234f9E9371",
    variableDebtToken: "0xC96113eED8cAB59cD8A66813bCB0cEb29F06D2e4",
  },
} as const satisfies Readonly<Record<Address, AaveV3Tokens>>;

/* Per-chain mapping of Aave V3 reserve underlyings to their aToken and variable debt
 * token, pinned so `fetchAaveV3Venue` fires every read in a single round instead of
 * resolving the token addresses from `getReserveData` first. */
const aaveV3TokensMapping = {
  [ChainId.EthMainnet]: MAINNET_AAVE_V3_TOKENS,
  [ChainId.VNet]: MAINNET_AAVE_V3_TOKENS,
} as const satisfies Record<ChainId, Readonly<Record<Address, AaveV3Tokens>>>;

const getAaveV3Tokens = (token: Address, chainId: ChainId): AaveV3Tokens => {
  const mapping: Readonly<Record<Address, AaveV3Tokens>> = aaveV3TokensMapping[chainId];
  if (mapping == null) throw new UnsupportedChainIdError(chainId);

  // Normalize casing to match the checksummed mapping keys.
  const tokens = mapping[getAddress(token)];
  if (tokens == null) throw new UnsupportedAaveV3TokenError(token, chainId);

  return tokens;
};

/** Returns the Aave V3 reserve's aToken for `token` on `chainId` (any casing), throwing
 * when the token has no registered reserve. */
export const getAToken = (token: Address, chainId: ChainId) =>
  getAaveV3Tokens(token, chainId).aToken;

/** Returns the Aave V3 reserve's variable debt token for `token` on `chainId` (any
 * casing), throwing when the token has no registered reserve. */
export const getVToken = (token: Address, chainId: ChainId) =>
  getAaveV3Tokens(token, chainId).variableDebtToken;

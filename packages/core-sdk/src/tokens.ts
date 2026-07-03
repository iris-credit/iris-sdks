import type { Address } from "viem";

import { fromEntries, values } from "@iris-credit/iris-ts";
import { CHAIN_ADDRESSES } from "./addresses.js";
import { ChainId } from "./chain.js";

/** Curated metadata for a token supported by the protocol.
 *
 * `symbol`, `name` and `decimals` mirror the on-chain ERC20 values exactly
 * (see the mainnet drift check in `test/tokens.test.ts`).
 */
export interface Token {
  readonly address: Address;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logoURI: string;
}

// TODO: interim placeholder — will be swapped to our own AWS CDN base later.
// S3 keys will use the same `<symbol-lowercase>.svg` naming, so the swap is
// this one constant.
export const LOGO_BASE_URL = "https://cdn.morpho.org/assets/logos";

export const CHAIN_TOKENS = {
  [ChainId.EthMainnet]: {
    USDC: {
      address: CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.USDC,
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      logoURI: `${LOGO_BASE_URL}/usdc.svg`,
    },
    USDT: {
      address: CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.USDT,
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      logoURI: `${LOGO_BASE_URL}/usdt.svg`,
    },
    WBTC: {
      address: CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.WBTC,
      symbol: "WBTC",
      name: "Wrapped BTC",
      decimals: 8,
      logoURI: `${LOGO_BASE_URL}/wbtc.svg`,
    },
    cbBTC: {
      address: CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.cbBTC,
      symbol: "cbBTC",
      name: "Coinbase Wrapped BTC",
      decimals: 8,
      logoURI: `${LOGO_BASE_URL}/cbbtc.svg`,
    },
    WETH: {
      address: CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.WETH,
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
      logoURI: `${LOGO_BASE_URL}/weth.svg`,
    },
    stETH: {
      address: CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.stETH,
      symbol: "stETH",
      name: "Liquid staked Ether 2.0",
      decimals: 18,
      logoURI: `${LOGO_BASE_URL}/steth.svg`,
    },
    wstETH: {
      address: CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.wstETH,
      symbol: "wstETH",
      name: "Wrapped liquid staked Ether 2.0",
      decimals: 18,
      logoURI: `${LOGO_BASE_URL}/wsteth.svg`,
    },
  },
} satisfies Record<ChainId, Record<string, Token>>;

const TOKENS_BY_ADDRESS = {
  [ChainId.EthMainnet]: fromEntries(
    values(CHAIN_TOKENS[ChainId.EthMainnet]).map((token) => [token.address.toLowerCase(), token]),
  ),
} satisfies Record<ChainId, Record<string, Token>>;

/** Looks up a token by chain id and address, case-insensitive on address
 * (indexers typically hold lowercase hex while `CHAIN_ADDRESSES` stores
 * checksummed addresses). */
export const getToken = (chainId: ChainId, address: string): Token | undefined => {
  return TOKENS_BY_ADDRESS[chainId][address.toLowerCase()];
};

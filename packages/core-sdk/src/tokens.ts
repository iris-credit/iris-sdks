import type { Address } from "viem";

import { values } from "@iris-credit/iris-ts";
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

const defineToken = (address: Address, symbol: string, name: string, decimals: number): Token => ({
  address,
  symbol,
  name,
  decimals,
  logoURI: `${LOGO_BASE_URL}/${symbol.toLowerCase()}.svg`,
});

export const CHAIN_TOKENS = {
  [ChainId.EthMainnet]: {
    USDC: defineToken(CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.USDC, "USDC", "USD Coin", 6),
    USDT: defineToken(CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.USDT, "USDT", "Tether USD", 6),
    WBTC: defineToken(CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.WBTC, "WBTC", "Wrapped BTC", 8),
    cbBTC: defineToken(
      CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.cbBTC,
      "cbBTC",
      "Coinbase Wrapped BTC",
      8,
    ),
    WETH: defineToken(CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.WETH, "WETH", "Wrapped Ether", 18),
    stETH: defineToken(
      CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.stETH,
      "stETH",
      "Liquid staked Ether 2.0",
      18,
    ),
    wstETH: defineToken(
      CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.wstETH,
      "wstETH",
      "Wrapped liquid staked Ether 2.0",
      18,
    ),
  },
} satisfies Record<ChainId, Record<string, Token>>;

/** Looks up a token by chain id and address, case-insensitive on address
 * (indexers typically hold lowercase hex while `CHAIN_ADDRESSES` stores
 * checksummed addresses). */
export const getTokenMetadata = (chainId: ChainId, address: Address): Token | undefined => {
  const lowercased = address.toLowerCase();

  return values(CHAIN_TOKENS[chainId]).find((token) => token.address.toLowerCase() === lowercased);
};

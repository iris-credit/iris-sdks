import type { Address } from "viem";

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

const mainnetTokens = CHAIN_ADDRESSES[ChainId.EthMainnet].tokens;

export const CHAIN_TOKENS = {
  [ChainId.EthMainnet]: [
    defineToken(mainnetTokens.USDC, "USDC", "USD Coin", 6),
    defineToken(mainnetTokens.USDT, "USDT", "Tether USD", 6),
    defineToken(mainnetTokens.WBTC, "WBTC", "Wrapped BTC", 8),
    defineToken(mainnetTokens.cbBTC, "cbBTC", "Coinbase Wrapped BTC", 8),
    defineToken(mainnetTokens.WETH, "WETH", "Wrapped Ether", 18),
    defineToken(mainnetTokens.stETH, "stETH", "Liquid staked Ether 2.0", 18),
    defineToken(mainnetTokens.wstETH, "wstETH", "Wrapped liquid staked Ether 2.0", 18),
  ],
} satisfies Record<ChainId, readonly Token[]>;

const TOKENS_BY_ADDRESS = {
  [ChainId.EthMainnet]: Object.fromEntries(
    CHAIN_TOKENS[ChainId.EthMainnet].map((token) => [token.address.toLowerCase(), token]),
  ),
} satisfies Record<ChainId, Record<string, Token>>;

/** Looks up a token by chain id and address, case-insensitive on address
 * (indexers typically hold lowercase hex while `CHAIN_ADDRESSES` stores
 * checksummed addresses). */
export const getToken = (chainId: ChainId, address: string): Token | undefined => {
  return TOKENS_BY_ADDRESS[chainId][address.toLowerCase()];
};

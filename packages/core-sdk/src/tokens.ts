import type { Address } from "viem";

import { isAddressEqual } from "viem";
import { keys } from "@iris-credit/iris-ts";
import { CHAIN_ADDRESSES } from "./addresses.js";
import { ChainId } from "./chain.js";
import { TokenMetadataNotFoundError } from "./errors.js";

/** Curated metadata for a token supported by the protocol.
 *
 * `symbol`, `name` and `decimals` mirror the on-chain ERC20 values exactly
 * (see the mainnet drift check in `tokens.test.ts`).
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

// Generic parameters keep each entry's literal types (`symbol: "USDC"`,
// `decimals: 6`) so `getTokenMetadata` returns the exact entry for a
// statically known address.
const defineToken = <A extends Address, S extends string, N extends string, D extends number>(
  address: A,
  symbol: S,
  name: N,
  decimals: D,
) =>
  ({
    address,
    symbol,
    name,
    decimals,
    logoURI: `${LOGO_BASE_URL}/${symbol.toLowerCase()}.svg`,
  }) satisfies Token;

const mainnetTokens = CHAIN_ADDRESSES[ChainId.EthMainnet].tokens;

export const CHAIN_TOKENS_METADATA = {
  [ChainId.EthMainnet]: {
    [mainnetTokens.USDC]: defineToken(mainnetTokens.USDC, "USDC", "USD Coin", 6),
    [mainnetTokens.USDT]: defineToken(mainnetTokens.USDT, "USDT", "Tether USD", 6),
    [mainnetTokens.WBTC]: defineToken(mainnetTokens.WBTC, "WBTC", "Wrapped BTC", 8),
    [mainnetTokens.cbBTC]: defineToken(mainnetTokens.cbBTC, "cbBTC", "Coinbase Wrapped BTC", 8),
    [mainnetTokens.WETH]: defineToken(mainnetTokens.WETH, "WETH", "Wrapped Ether", 18),
    [mainnetTokens.stETH]: defineToken(mainnetTokens.stETH, "stETH", "Liquid staked Ether 2.0", 18),
    [mainnetTokens.wstETH]: defineToken(
      mainnetTokens.wstETH,
      "wstETH",
      "Wrapped liquid staked Ether 2.0",
      18,
    ),
  },
} satisfies Record<ChainId, Record<Address, Token>>;

/**
 * Gets the curated token metadata for a given chain and token address,
 * case-insensitive on address (indexers typically hold lowercase hex while
 * `CHAIN_ADDRESSES` stores checksummed addresses).
 *
 * @throws `TokenMetadataNotFoundError` if the address has no entry.
 * @example
 * // Statically known address: returns the exact entry, e.g. `decimals` is typed `6`.
 * const usdc = getTokenMetadata(ChainId.EthMainnet, CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.USDC);
 */
export function getTokenMetadata<
  TChainId extends ChainId,
  TAddress extends keyof (typeof CHAIN_TOKENS_METADATA)[TChainId],
>(chainId: TChainId, address: TAddress): (typeof CHAIN_TOKENS_METADATA)[TChainId][TAddress];
export function getTokenMetadata(chainId: ChainId, address: Address): Token;
export function getTokenMetadata(chainId: ChainId, address: Address) {
  const chainTokensMetadata = CHAIN_TOKENS_METADATA[chainId];
  const key = keys(chainTokensMetadata).find((key) => isAddressEqual(key, address));

  if (!key) throw new TokenMetadataNotFoundError(chainId, address);

  return chainTokensMetadata[key];
}

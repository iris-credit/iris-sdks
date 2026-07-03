import type { Address } from "viem";
import type { Token } from "./tokens.js";

import { createPublicClient, erc20Abi, http } from "viem";
import { describe, expect, expectTypeOf, test } from "vitest";
import { ZERO_ADDRESS, entries, fromEntries, values } from "@iris-credit/iris-ts";
import { CHAIN_ADDRESSES } from "./addresses.js";
import { ChainId } from "./chain.js";
import { IrisCoreErrors } from "./errors.js";
import { CHAIN_TOKENS_METADATA, LOGO_BASE_URL, getTokenMetadata } from "./tokens.js";

const mainnetTokensMetadata = CHAIN_TOKENS_METADATA[ChainId.EthMainnet];

describe("tokens", () => {
  test("should have exactly one entry per CHAIN_ADDRESSES token", () => {
    const bySymbol = fromEntries(
      values(mainnetTokensMetadata).map(({ symbol, address }) => [symbol, address]),
    );

    expect(bySymbol).toEqual(CHAIN_ADDRESSES[ChainId.EthMainnet].tokens);
  });

  test("should be keyed by each entry's address", () => {
    for (const [key, { address }] of entries(mainnetTokensMetadata)) {
      expect(address).toBe(key);
    }
  });

  test("should have expected decimals", () => {
    const bySymbol = fromEntries(
      values(mainnetTokensMetadata).map(({ symbol, decimals }) => [symbol, decimals]),
    );

    expect(bySymbol).toEqual({
      USDC: 6,
      USDT: 6,
      WBTC: 8,
      cbBTC: 8,
      WETH: 18,
      stETH: 18,
      wstETH: 18,
    });
  });

  test("should build logoURI from the lowercased symbol", () => {
    for (const { symbol, logoURI } of values(mainnetTokensMetadata)) {
      expect(logoURI).toBe(`${LOGO_BASE_URL}/${symbol.toLowerCase()}.svg`);
    }
  });

  test("should look up tokens case-insensitively on address", () => {
    for (const token of values(mainnetTokensMetadata)) {
      expect(getTokenMetadata(ChainId.EthMainnet, token.address)).toBe(token); // checksummed
      expect(getTokenMetadata(ChainId.EthMainnet, token.address.toLowerCase() as Address)).toBe(
        token,
      );
      expect(
        getTokenMetadata(ChainId.EthMainnet, `0x${token.address.slice(2).toUpperCase()}`),
      ).toBe(token);
    }
  });

  test("should throw for an unknown address", () => {
    expect(() => getTokenMetadata(ChainId.EthMainnet, ZERO_ADDRESS)).toThrow(
      IrisCoreErrors.TokenMetadataNotFound,
    );
  });

  test("should return the exact entry type for a statically known address", () => {
    const usdc = getTokenMetadata(
      ChainId.EthMainnet,
      CHAIN_ADDRESSES[ChainId.EthMainnet].tokens.USDC,
    );

    expectTypeOf(usdc.symbol).toEqualTypeOf<"USDC">();
    expectTypeOf(usdc.decimals).toEqualTypeOf<6>();
    expectTypeOf((address: Address) =>
      getTokenMetadata(ChainId.EthMainnet, address),
    ).returns.toEqualTypeOf<Token>();

    expect(usdc.decimals).toBe(6);
  });
});

// Verifies the curated entries against live mainnet state. Skipped unless an
// RPC url is provided, e.g.:
// MAINNET_RPC_URL=https://gateway.tenderly.co/public/mainnet pnpm vitest run
const rpcUrl = process.env.MAINNET_RPC_URL;

describe.runIf(rpcUrl)("tokens drift check", () => {
  test("should match on-chain symbol, name & decimals", { timeout: 60_000 }, async () => {
    const client = createPublicClient({ transport: http(rpcUrl) });

    for (const token of values(mainnetTokensMetadata)) {
      const abi = erc20Abi;
      const { address } = token;

      const [symbol, name, decimals] = await Promise.all([
        client.readContract({ address, abi, functionName: "symbol" }),
        client.readContract({ address, abi, functionName: "name" }),
        client.readContract({ address, abi, functionName: "decimals" }),
      ]);

      expect({ address, symbol, name, decimals }).toEqual({
        address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
      });
    }
  });

  test("should serve every logoURI", { timeout: 60_000 }, async () => {
    for (const { logoURI } of values(mainnetTokensMetadata)) {
      const { status } = await fetch(logoURI, { method: "HEAD" });

      expect({ logoURI, status }).toEqual({ logoURI, status: 200 });
    }
  });
});

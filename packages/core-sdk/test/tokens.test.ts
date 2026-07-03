import type { Address } from "viem";

import { createPublicClient, erc20Abi, http } from "viem";
import { describe, expect, test } from "vitest";
import { ZERO_ADDRESS, entries, fromEntries, values } from "@iris-credit/iris-ts";
import {
  CHAIN_ADDRESSES,
  CHAIN_TOKENS,
  ChainId,
  LOGO_BASE_URL,
  getTokenMetadata,
} from "../src/index.js";

const mainnetTokens = CHAIN_TOKENS[ChainId.EthMainnet];

describe("tokens", () => {
  test("should have exactly one entry per CHAIN_ADDRESSES token", () => {
    const bySymbol = fromEntries(
      values(mainnetTokens).map(({ symbol, address }) => [symbol, address]),
    );

    expect(bySymbol).toEqual(CHAIN_ADDRESSES[ChainId.EthMainnet].tokens);
  });

  test("should be keyed by symbol", () => {
    for (const [key, { symbol }] of entries(mainnetTokens)) {
      expect(symbol).toBe(key);
    }
  });

  test("should have expected decimals", () => {
    const bySymbol = fromEntries(
      values(mainnetTokens).map(({ symbol, decimals }) => [symbol, decimals]),
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
    for (const { symbol, logoURI } of values(mainnetTokens)) {
      expect(logoURI).toBe(`${LOGO_BASE_URL}/${symbol.toLowerCase()}.svg`);
    }
  });

  test("should look up tokens case-insensitively on address", () => {
    for (const token of values(mainnetTokens)) {
      expect(getTokenMetadata(ChainId.EthMainnet, token.address)).toBe(token); // checksummed
      expect(getTokenMetadata(ChainId.EthMainnet, token.address.toLowerCase() as Address)).toBe(
        token,
      );
      expect(
        getTokenMetadata(ChainId.EthMainnet, `0x${token.address.slice(2).toUpperCase()}`),
      ).toBe(token);
    }
  });

  test("should return undefined for an unknown address", () => {
    expect(getTokenMetadata(ChainId.EthMainnet, ZERO_ADDRESS)).toBeUndefined();
  });
});

// Verifies the curated entries against live mainnet state. Skipped unless an
// RPC url is provided, e.g.:
// MAINNET_RPC_URL=https://gateway.tenderly.co/public/mainnet pnpm vitest run
const rpcUrl = process.env.MAINNET_RPC_URL;

describe.runIf(rpcUrl)("tokens drift check", () => {
  test("should match on-chain symbol, name & decimals", { timeout: 60_000 }, async () => {
    const client = createPublicClient({ transport: http(rpcUrl) });

    for (const token of values(mainnetTokens)) {
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
    for (const { logoURI } of values(mainnetTokens)) {
      const { status } = await fetch(logoURI, { method: "HEAD" });

      expect({ logoURI, status }).toEqual({ logoURI, status: 200 });
    }
  });
});

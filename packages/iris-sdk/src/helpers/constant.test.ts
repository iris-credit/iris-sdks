import { isAddressEqual } from "viem";
import { describe, expect, test } from "vitest";
import { ChainId, getChainAddresses, MathLib } from "@iris-credit/core-sdk";
import { APPROVE_ONLY_ONCE_TOKENS, DEFAULT_LLTV_BUFFER } from "./constant.js";

describe("iris-sdk helper constants", () => {
  test("DEFAULT_LLTV_BUFFER is 0.5% (WAD/200)", () => {
    expect(DEFAULT_LLTV_BUFFER).toBe(MathLib.WAD / 200n);
    expect(DEFAULT_LLTV_BUFFER).toBe(5_000_000_000_000_000n);
  });

  test("DEFAULT_LLTV_BUFFER is a positive bigint below WAD", () => {
    expect(typeof DEFAULT_LLTV_BUFFER).toBe("bigint");
    expect(DEFAULT_LLTV_BUFFER).toBeGreaterThan(0n);
    expect(DEFAULT_LLTV_BUFFER).toBeLessThan(MathLib.WAD);
  });

  test("APPROVE_ONLY_ONCE_TOKENS lists USDT on mainnet", () => {
    const tokens = APPROVE_ONLY_ONCE_TOKENS[ChainId.EthMainnet];
    const { USDT } = getChainAddresses(ChainId.EthMainnet).tokens;

    expect(tokens).toBeDefined();
    expect(tokens?.some((token) => isAddressEqual(token, USDT))).toBe(true);
  });
});

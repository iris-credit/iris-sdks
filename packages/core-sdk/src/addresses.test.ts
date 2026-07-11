import type { Address } from "viem";

import { describe, expect, test } from "vitest";
import { CHAIN_ADDRESSES, getUnwrappedToken, NATIVE_ADDRESS } from "./addresses.js";
import { ChainId } from "./chain.js";
import { UnsupportedChainIdError } from "./errors.js";

const { USDC, WETH, wstETH, stETH } = CHAIN_ADDRESSES[ChainId.EthMainnet].tokens;

describe("getUnwrappedToken", () => {
  test("should return the unwrapped token for a registered wrapper", () => {
    expect(getUnwrappedToken(WETH, ChainId.EthMainnet)).toBe(NATIVE_ADDRESS);
    expect(getUnwrappedToken(stETH, ChainId.EthMainnet)).toBe(NATIVE_ADDRESS);
    expect(getUnwrappedToken(wstETH, ChainId.EthMainnet)).toBe(stETH);
  });

  test("should normalize the wrapped token casing", () => {
    expect(getUnwrappedToken(WETH.toLowerCase() as Address, ChainId.EthMainnet)).toBe(
      NATIVE_ADDRESS,
    );
  });

  test("should return undefined for an unregistered token", () => {
    expect(getUnwrappedToken(USDC, ChainId.EthMainnet)).toBeUndefined();
  });

  test("should throw for an unsupported chain id", () => {
    expect(() => getUnwrappedToken(WETH, 999 as ChainId)).toThrow(UnsupportedChainIdError);
  });
});

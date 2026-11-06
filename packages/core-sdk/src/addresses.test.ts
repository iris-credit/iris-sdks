import type { Address } from "viem";

import { describe, expect, test } from "vitest";
import {
  CHAIN_ADDRESSES,
  getChainAddresses,
  getSparkLendSpToken,
  getSparkLendVToken,
  getUnwrappedToken,
  NATIVE_ADDRESS,
} from "./addresses.js";
import { ChainId } from "./chain.js";
import { UnsupportedChainIdError, UnsupportedSparkLendTokenError } from "./errors.js";

const { USDC, WETH, wstETH, stETH } = CHAIN_ADDRESSES[ChainId.EthMainnet].tokens;

describe("getChainAddresses", () => {
  test("should return the registry entry of a supported chain", () => {
    for (const chainId of [ChainId.EthMainnet, ChainId.VNet]) {
      expect(getChainAddresses(chainId)).toBe(CHAIN_ADDRESSES[chainId]);
    }
  });

  test("should expose the deployed Iris contracts", () => {
    const { iris, blm, whitelistBlm, podImpl } = getChainAddresses(ChainId.EthMainnet);

    expect(iris).toBe("0x77310475712D7a127D694B3e9D186d9f4a423bd9");
    expect(blm).toBe("0xB0ffB27D9D7f160d588c669329F807e58aDd4eeF");
    expect(whitelistBlm).toBe("0xA5eaa1F8124bf8BD66e9E08FfB757B9bf936581a");
    expect(podImpl).toBe("0x31737b24DfE3eb77ee12a6eA764980dE36E03811");
  });

  test("should throw for an unsupported chain id", () => {
    expect(() => getChainAddresses(999 as ChainId)).toThrow(UnsupportedChainIdError);
  });
});

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

describe("getSparkLendSpToken / getSparkLendVToken", () => {
  test("should return the pinned SparkLend reserve tokens", () => {
    expect(getSparkLendSpToken(USDC, ChainId.EthMainnet)).toBe(
      "0x377C3bd93f2a2984E1E7bE6A5C22c525eD4A4815",
    );
    expect(getSparkLendVToken(USDC, ChainId.EthMainnet)).toBe(
      "0x7B70D04099CB9cfb1Db7B6820baDAfB4C5C70A67",
    );
    // VNet forks mainnet, so it shares the pinned tokens.
    expect(getSparkLendSpToken(USDC, ChainId.VNet)).toBe(
      getSparkLendSpToken(USDC, ChainId.EthMainnet),
    );
  });

  test("should normalize the token casing", () => {
    expect(getSparkLendSpToken(USDC.toLowerCase() as Address, ChainId.EthMainnet)).toBe(
      getSparkLendSpToken(USDC, ChainId.EthMainnet),
    );
  });

  test("should throw for a token without a pinned SparkLend reserve", () => {
    expect(() => getSparkLendSpToken(stETH, ChainId.EthMainnet)).toThrow(
      UnsupportedSparkLendTokenError,
    );
    expect(() => getSparkLendVToken(stETH, ChainId.EthMainnet)).toThrow(
      UnsupportedSparkLendTokenError,
    );
  });

  test("should throw for an unsupported chain id", () => {
    expect(() => getSparkLendSpToken(USDC, 999 as ChainId)).toThrow(UnsupportedChainIdError);
  });
});

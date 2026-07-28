import type { Address } from "viem";

import { describe, expect, test } from "vitest";
import {
  CHAIN_ADDRESSES,
  getChainAddresses,
  getUnwrappedToken,
  NATIVE_ADDRESS,
} from "./addresses.js";
import { ChainId } from "./chain.js";
import { UnsupportedChainIdError } from "./errors.js";

const { USDC, WETH, wstETH, stETH } = CHAIN_ADDRESSES[ChainId.EthMainnet].tokens;

describe("getChainAddresses", () => {
  test("should return the registry entry of a supported chain", () => {
    for (const chainId of [ChainId.EthMainnet, ChainId.VNet]) {
      expect(getChainAddresses(chainId)).toBe(CHAIN_ADDRESSES[chainId]);
    }
  });

  test("should expose the deployed Iris contracts", () => {
    const { iris, blm, whitelistBlm, podImpl } = getChainAddresses(ChainId.EthMainnet);

    expect(iris).toBe("0x758cD1Bd54715B8DCc5D33968800fC8e87C8695c");
    expect(blm).toBe("0x8cc058689674f0b54820a04b47618df45d04cBcb");
    expect(whitelistBlm).toBe("0xe0Ae439c391D8dCf870a3045f09Fe901fE8Ef07B");
    expect(podImpl).toBe("0xDdAE7326DBeEBfD4E3C1e16b9333e795861cEABA");
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

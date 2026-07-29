import type { Address } from "viem";

import { erc20Abi, erc20Abi_bytes32, stringToHex } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { createMockClient, mockRead } from "@iris-credit/test/mock";
import { getChainAddresses, NATIVE_ADDRESS } from "../../addresses.js";
import { ChainId } from "../../chain.js";
import { UnsupportedChainIdError } from "../../errors.js";
import { ConstantWrappedToken } from "./ConstantWrappedToken.js";
import { decodeBytes32String, fetchToken } from "./fetch.js";
import { Token } from "./Token.js";

const { tokens } = getChainAddresses(ChainId.EthMainnet);

const mockErc20Metadata = (
  address: Address,
  metadata: { decimals: number; symbol: string; name: string },
) => {
  const handle = createMockClient(mainnet);

  mockRead(handle, {
    address,
    abi: erc20Abi,
    functionName: "decimals",
    result: metadata.decimals,
  });
  mockRead(handle, {
    address,
    abi: erc20Abi,
    functionName: "symbol",
    result: metadata.symbol,
  });
  mockRead(handle, { address, abi: erc20Abi, functionName: "name", result: metadata.name });

  return handle;
};

describe("decodeBytes32String", () => {
  test("default", () => {
    expect(decodeBytes32String(stringToHex("USDC", { size: 32 }))).toBe("USDC");
  });

  test("behavior: passes a plain string through unchanged", () => {
    expect(decodeBytes32String("USD Coin")).toBe("USD Coin");
  });

  test("behavior: trims the zero padding of a short value", () => {
    expect(decodeBytes32String(stringToHex("MKR", { size: 32 }))).toBe("MKR");
  });
});

describe("fetchToken", () => {
  test("default", async () => {
    const { client } = mockErc20Metadata(tokens.USDC, {
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
    });

    expect(await fetchToken(tokens.USDC, client)).toStrictEqual(
      new Token({ address: tokens.USDC, decimals: 6, symbol: "USDC", name: "USD Coin" }),
    );
  });

  test("behavior: returns the chain's native token without any read", async () => {
    const handle = createMockClient(mainnet);

    expect(
      await fetchToken(NATIVE_ADDRESS, handle.client, { chainId: ChainId.EthMainnet }),
    ).toStrictEqual(Token.native(ChainId.EthMainnet));
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("behavior: falls back to the bytes32 metadata abi when string decoding fails", async () => {
    // `symbol()` and `name()` share their selector across both abis, so a bytes32-returning
    // token fails the string decode and only resolves through the retry — as MKR does.
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: tokens.USDC,
      abi: erc20Abi,
      functionName: "decimals",
      result: 18,
    });
    mockRead(handle, {
      address: tokens.USDC,
      abi: erc20Abi_bytes32,
      functionName: "symbol",
      result: stringToHex("MKR", { size: 32 }),
    });
    mockRead(handle, {
      address: tokens.USDC,
      abi: erc20Abi_bytes32,
      functionName: "name",
      result: stringToHex("Maker", { size: 32 }),
    });

    expect(await fetchToken(tokens.USDC, handle.client)).toStrictEqual(
      new Token({ address: tokens.USDC, decimals: 18, symbol: "MKR", name: "Maker" }),
    );
  });

  test("behavior: leaves every failing optional read undefined", async () => {
    // Nothing is mocked: `decimals`, `symbol`, `name` and both bytes32 retries all reject.
    const { client } = createMockClient(mainnet);
    const token = await fetchToken(tokens.USDC, client);

    expect(token).toStrictEqual(new Token({ address: tokens.USDC }));
    expect(token.symbol).toBeUndefined();
    expect(token.name).toBeUndefined();
    expect(token.decimals).toBe(0);
  });

  test("behavior: wraps a token with a registered unwrapped token", async () => {
    const { client } = mockErc20Metadata(tokens.WETH, {
      decimals: 18,
      symbol: "WETH",
      name: "Wrapped Ether",
    });

    expect(await fetchToken(tokens.WETH, client)).toStrictEqual(
      new ConstantWrappedToken(
        { address: tokens.WETH, decimals: 18, symbol: "WETH", name: "Wrapped Ether" },
        NATIVE_ADDRESS,
        18,
      ),
    );
  });

  test("behavior: normalizes the address casing before dispatching", async () => {
    const { client } = mockErc20Metadata(tokens.WETH, {
      decimals: 18,
      symbol: "WETH",
      name: "Wrapped Ether",
    });
    const token = await fetchToken(tokens.WETH.toLowerCase() as typeof tokens.WETH, client);

    expect(token.address).toBe(tokens.WETH);
    expect(token).toBeInstanceOf(ConstantWrappedToken);
  });

  test("error: UnsupportedChainIdError", async () => {
    const { client } = createMockClient(mainnet);

    await expect(
      fetchToken(tokens.USDC, client, { chainId: 999 as ChainId }),
    ).rejects.toBeInstanceOf(UnsupportedChainIdError);
  });
});

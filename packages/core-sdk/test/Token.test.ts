import { describe, expect } from "vitest";
import { randomAddress } from "@iris-credit/test";
import { Token } from "../src/augment/Token.js";
import { ChainId, ExchangeRateWrappedToken, getChainAddresses } from "../src/index.js";
import { test } from "./setup.js";

const { USDC, wstETH, stETH } = getChainAddresses(ChainId.EthMainnet).tokens;

// MKR's `name` and `symbol` are `bytes32`, exercising the metadata decoding fallback.
const mkr = "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2";

describe("augment/Token", () => {
  test("should fetch token data", { timeout: 30_000 }, async ({ client }) => {
    const expectedData = new Token({
      address: USDC,
      decimals: 6,
      symbol: "USDC",
      name: "USD Coin",
    });

    const value = await Token.fetch(USDC, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch wrapped token data", { timeout: 30_000 }, async ({ client }) => {
    const expectedData = new ExchangeRateWrappedToken(
      {
        address: wstETH,
        decimals: 18,
        symbol: "wstETH",
        name: "Wrapped liquid staked Ether 2.0",
      },
      stETH,
      expect.any(BigInt),
    );

    const value = await Token.fetch(wstETH, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch MKR token data", { timeout: 30_000 }, async ({ client }) => {
    const expectedData = new Token({
      address: mkr,
      decimals: 18,
      symbol: "MKR",
      name: "Maker",
    });

    const value = await Token.fetch(mkr, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should fetch invalid ERC20", { timeout: 30_000 }, async ({ client }) => {
    const expectedData = new Token({ address: randomAddress() });

    const value = await Token.fetch(expectedData.address, client);

    expect(value).toStrictEqual(expectedData);
  });
});

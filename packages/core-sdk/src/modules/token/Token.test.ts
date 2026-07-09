import { describe, expect, test } from "vitest";
import { NATIVE_ADDRESS } from "../../addresses.js";
import { ChainId } from "../../chain.js";
import { MathLib } from "../../math/index.js";
import { Token } from "./Token.js";

const ADDRESS = "0x1111111111111111111111111111111111111111";

describe("Token", () => {
  describe("constructor", () => {
    test("should store all provided fields", () => {
      const token = new Token({
        address: ADDRESS,
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        price: MathLib.WAD,
      });

      expect(token.address).toBe(ADDRESS);
      expect(token.name).toBe("USD Coin");
      expect(token.symbol).toBe("USDC");
      expect(token.decimals).toBe(6);
      expect(token.price).toBe(MathLib.WAD);
    });

    test("should default decimals to 0", () => {
      expect(new Token({ address: ADDRESS }).decimals).toBe(0);
    });

    test("should coerce decimals from BigIntish to a number", () => {
      expect(new Token({ address: ADDRESS, decimals: 18n }).decimals).toBe(18);
      expect(new Token({ address: ADDRESS, decimals: "8" }).decimals).toBe(8);
    });

    test("should leave price undefined when omitted", () => {
      expect(new Token({ address: ADDRESS, decimals: 6 }).price).toBeUndefined();
    });

    test("should coerce price from BigIntish to a bigint", () => {
      expect(new Token({ address: ADDRESS, price: 1n }).price).toBe(1n);
      expect(new Token({ address: ADDRESS, price: "2" }).price).toBe(2n);
      expect(new Token({ address: ADDRESS, price: 3 }).price).toBe(3n);
    });

    test("should keep a zero price as defined", () => {
      // Only `undefined`/`null` leaves the price unset; 0n is a real price.
      expect(new Token({ address: ADDRESS, price: 0n }).price).toBe(0n);
    });
  });

  describe("native", () => {
    test("should build the token from the chain's native currency metadata", () => {
      const eth = Token.native(ChainId.EthMainnet);

      expect(eth.address).toBe(NATIVE_ADDRESS);
      expect(eth.name).toBe("Ether");
      expect(eth.symbol).toBe("ETH");
      expect(eth.decimals).toBe(18);
      expect(eth.price).toBeUndefined();
    });
  });

  describe("toUsd", () => {
    test("should return undefined when the price is unknown", () => {
      expect(new Token({ address: ADDRESS, decimals: 18 }).toUsd(MathLib.WAD)).toBeUndefined();
    });

    test("should quote tokens as amount * price / 10 ** decimals", () => {
      // 1 USDC (1e6) priced at 1 WAD is worth 1 WAD of USD.
      const usdc = new Token({ address: ADDRESS, decimals: 6, price: MathLib.WAD });

      expect(usdc.toUsd(1_000_000n)).toBe(MathLib.WAD);
    });

    test("should floor by default and honor an explicit rounding direction", () => {
      // 1 * 1 / 10 ** 1 = 0.1.
      const token = new Token({ address: ADDRESS, decimals: 1, price: 1n });

      expect(token.toUsd(1n)).toBe(0n);
      expect(token.toUsd(1n, "Down")).toBe(0n);
      expect(token.toUsd(1n, "Up")).toBe(1n);
    });
  });

  describe("fromUsd", () => {
    test("should return undefined when the price is unknown", () => {
      expect(new Token({ address: ADDRESS, decimals: 18 }).fromUsd(MathLib.WAD)).toBeUndefined();
    });

    test("should quote USD as amount * 10 ** decimals / price", () => {
      // 1 WAD of USD buys 1 USDC (1e6) at a price of 1 WAD.
      const usdc = new Token({ address: ADDRESS, decimals: 6, price: MathLib.WAD });

      expect(usdc.fromUsd(MathLib.WAD)).toBe(1_000_000n);
    });

    test("should floor by default and honor an explicit rounding direction", () => {
      // 1 * 10 ** 0 / 3 = 0.333….
      const token = new Token({ address: ADDRESS, decimals: 0, price: 3n });

      expect(token.fromUsd(1n)).toBe(0n);
      expect(token.fromUsd(1n, "Down")).toBe(0n);
      expect(token.fromUsd(1n, "Up")).toBe(1n);
    });
  });
});

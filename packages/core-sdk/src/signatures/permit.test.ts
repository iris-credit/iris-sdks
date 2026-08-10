import type { Address } from "viem";

import { describe, expect, test } from "vitest";
import { SPENDER, USER } from "../../test/fixtures/iris.js";
import { CHAIN_ADDRESSES } from "../addresses.js";
import { ChainId } from "../chain.js";
import { UnsupportedChainIdError } from "../errors.js";
import { Token } from "../modules/token/Token.js";
import {
  getPermitDomainVersion,
  getPermitTypedData,
  getSimplePermitTokens,
  SIMPLE_PERMIT_TOKENS,
} from "./permit.js";

const { cbBTC, USDC, WETH } = CHAIN_ADDRESSES[ChainId.EthMainnet].tokens;

describe("getPermitTypedData", () => {
  test("builds a default version 2 domain for USDC", () => {
    const typedData = getPermitTypedData(
      {
        erc20: new Token({ address: USDC, name: "USD Coin" }),
        owner: USER,
        spender: SPENDER,
        allowance: 1n,
        nonce: 1n,
        deadline: 1n,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.domain?.version).toBe("2");
    expect(typedData.domain?.verifyingContract).toBe(USDC);
  });

  test("builds a version 2 domain for a Circle-family token that is not USDC", () => {
    const typedData = getPermitTypedData(
      {
        erc20: new Token({ address: cbBTC, name: "Coinbase Wrapped BTC" }),
        owner: USER,
        spender: SPENDER,
        allowance: 1n,
        nonce: 1n,
        deadline: 1n,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.domain?.version).toBe("2");
  });

  test("builds a default version 1 domain for other ERC20 tokens", () => {
    const typedData = getPermitTypedData(
      {
        erc20: new Token({ address: WETH, name: "Wrapped Ether" }),
        owner: USER,
        spender: SPENDER,
        allowance: 1n,
        nonce: 1n,
        deadline: 1n,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.domain).toEqual({
      name: "Wrapped Ether",
      version: "1",
      chainId: ChainId.EthMainnet,
      verifyingContract: WETH,
    });
  });

  test("maps the allowance onto the EIP-2612 value field", () => {
    const typedData = getPermitTypedData(
      {
        erc20: new Token({ address: WETH, name: "Wrapped Ether" }),
        owner: USER,
        spender: SPENDER,
        allowance: 1_000_000n,
        nonce: 2n,
        deadline: 3n,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.message).toEqual({
      owner: USER,
      spender: SPENDER,
      value: 1_000_000n,
      nonce: 2n,
      deadline: 3n,
    });
    expect(typedData.primaryType).toBe("Permit");
  });

  test("orders the Permit fields as the EIP-2612 typehash does", () => {
    const typedData = getPermitTypedData(
      {
        erc20: new Token({ address: WETH, name: "Wrapped Ether" }),
        owner: USER,
        spender: SPENDER,
        allowance: 1n,
        nonce: 1n,
        deadline: 1n,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.types.Permit).toEqual([
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ]);
  });
});

describe("getSimplePermitTokens", () => {
  test("should return the verified tokens of a supported chain", () => {
    for (const chainId of [ChainId.EthMainnet, ChainId.VNet]) {
      expect(getSimplePermitTokens(chainId)).toBe(SIMPLE_PERMIT_TOKENS[chainId]);
    }
  });

  test("should throw UnsupportedChainIdError for an unsupported chain", () => {
    expect(() => getSimplePermitTokens(999 as ChainId)).toThrow(UnsupportedChainIdError);
  });
});

describe("getPermitDomainVersion", () => {
  test("reads the verified version of a token, whatever the address casing", () => {
    expect(getPermitDomainVersion(cbBTC, ChainId.EthMainnet)).toBe("2");
    expect(getPermitDomainVersion(cbBTC.toLowerCase() as Address, ChainId.EthMainnet)).toBe("2");
  });

  test("returns undefined for an unverified token", () => {
    expect(getPermitDomainVersion(WETH, ChainId.EthMainnet)).toBeUndefined();
  });

  test("keeps cbBTC unverified on the fork, whose stored separator holds mainnet's chain id", () => {
    // FiatTokenV2_1 computes its domain separator once at initialization; USDC (V2_2) recomputes.
    expect(getPermitDomainVersion(cbBTC, ChainId.VNet)).toBeUndefined();
    expect(getPermitDomainVersion(USDC, ChainId.VNet)).toBe("2");
  });
});

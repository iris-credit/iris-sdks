import { describe, expect, test } from "vitest";
import { SPENDER, USER } from "../__test__/fixtures.js";
import { CHAIN_ADDRESSES } from "../addresses.js";
import { ChainId } from "../chain.js";
import { Token } from "../modules/token/Token.js";
import { getPermitTypedData } from "./permit.js";

const { USDC, WETH } = CHAIN_ADDRESSES[ChainId.EthMainnet].tokens;

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

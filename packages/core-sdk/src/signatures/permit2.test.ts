import { describe, expect, test } from "vitest";
import { DEBT_TOKEN, SPENDER } from "../../test/fixtures/iris.js";
import { CHAIN_ADDRESSES } from "../addresses.js";
import { ChainId } from "../chain.js";
import { MathLib } from "../math/index.js";
import { getPermit2PermitTypedData, getPermit2TransferFromTypedData } from "./permit2.js";

const { permit2 } = CHAIN_ADDRESSES[ChainId.EthMainnet];

describe("getPermit2PermitTypedData", () => {
  test("clamps allowance and defaults expiration to MAX_UINT_48", () => {
    const typedData = getPermit2PermitTypedData(
      {
        erc20: DEBT_TOKEN,
        allowance: MathLib.MAX_UINT_160 + 1n,
        nonce: 7,
        deadline: 8n,
        spender: SPENDER,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.domain).toEqual({
      name: "Permit2",
      chainId: ChainId.EthMainnet,
      verifyingContract: permit2,
    });
    expect(typedData.message.details).toEqual({
      token: DEBT_TOKEN,
      amount: MathLib.MAX_UINT_160,
      expiration: MathLib.MAX_UINT_48,
      nonce: 7,
    });
    expect(typedData.primaryType).toBe("PermitSingle");
  });

  test("preserves finite allowance and expiration", () => {
    const typedData = getPermit2PermitTypedData(
      {
        erc20: DEBT_TOKEN,
        allowance: 10n,
        expiration: 11,
        nonce: 12,
        deadline: 13n,
        spender: SPENDER,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.message.details).toEqual({
      token: DEBT_TOKEN,
      amount: 10n,
      expiration: 11n,
      nonce: 12,
    });
    expect(typedData.message.spender).toBe(SPENDER);
    expect(typedData.message.sigDeadline).toBe(13n);
  });

  test("clamps an expiration beyond MAX_UINT_48", () => {
    const typedData = getPermit2PermitTypedData(
      {
        erc20: DEBT_TOKEN,
        allowance: 10n,
        expiration: Number(MathLib.MAX_UINT_48) + 1,
        nonce: 12,
        deadline: 13n,
        spender: SPENDER,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.message.details).toEqual({
      token: DEBT_TOKEN,
      amount: 10n,
      expiration: MathLib.MAX_UINT_48,
      nonce: 12,
    });
  });

  test("orders the PermitSingle and PermitDetails fields as Permit2 does", () => {
    const typedData = getPermit2PermitTypedData(
      {
        erc20: DEBT_TOKEN,
        allowance: 10n,
        nonce: 0,
        deadline: 1n,
        spender: SPENDER,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.types.PermitSingle).toEqual([
      { name: "details", type: "PermitDetails" },
      { name: "spender", type: "address" },
      { name: "sigDeadline", type: "uint256" },
    ]);
    expect(typedData.types.PermitDetails).toEqual([
      { name: "token", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ]);
  });
});

describe("getPermit2TransferFromTypedData", () => {
  test("clamps transfer allowance to MAX_UINT_256", () => {
    const typedData = getPermit2TransferFromTypedData(
      {
        erc20: DEBT_TOKEN,
        allowance: MathLib.MAX_UINT_256 + 1n,
        nonce: 14n,
        deadline: 15n,
        spender: SPENDER,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.message).toEqual({
      permitted: { token: DEBT_TOKEN, amount: MathLib.MAX_UINT_256 },
      spender: SPENDER,
      nonce: 14n,
      deadline: 15n,
    });
    expect(typedData.domain).toEqual({
      name: "Permit2",
      chainId: ChainId.EthMainnet,
      verifyingContract: permit2,
    });
    expect(typedData.primaryType).toBe("PermitTransferFrom");
  });

  test("orders the PermitTransferFrom and TokenPermissions fields as Permit2 does", () => {
    const typedData = getPermit2TransferFromTypedData(
      {
        erc20: DEBT_TOKEN,
        allowance: 1n,
        nonce: 0n,
        deadline: 1n,
        spender: SPENDER,
      },
      ChainId.EthMainnet,
    );

    expect(typedData.types.PermitTransferFrom).toEqual([
      { name: "permitted", type: "TokenPermissions" },
      { name: "spender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ]);
    expect(typedData.types.TokenPermissions).toEqual([
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ]);
  });
});

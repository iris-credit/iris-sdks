import type { Address } from "viem";

import { decodeFunctionData, erc20Abi, isHex, maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { CHAIN_ID, ROGUE } from "../../../../test/fixtures/iris.js";
import { MAX_TOKEN_APPROVALS } from "../../../helpers/index.js";
import { UnsupportedErc20ApprovalSpenderError } from "../../../types/index.js";
import { encodeErc20Approval } from "./encodeErc20Approval.js";

describe("encodeErc20Approval", () => {
  const {
    iris,
    permit2,
    tokens: { USDC },
    bundler3: { generalAdapter1 },
  } = getChainAddresses(CHAIN_ID);

  const mockAmount = 1000000n;

  test("should set correct transaction properties", () => {
    const transaction = encodeErc20Approval({
      token: USDC,
      spender: generalAdapter1,
      amount: mockAmount,
      chainId: CHAIN_ID,
    });

    expect(transaction.to).toEqual(USDC);
    expect(transaction.value).toEqual(0n);
    expect(isHex(transaction.data)).toBe(true);
  });

  test("should encode approve function call correctly", () => {
    const transaction = encodeErc20Approval({
      token: USDC,
      spender: generalAdapter1,
      amount: mockAmount,
      chainId: CHAIN_ID,
    });

    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: transaction.data,
    });

    expect(decoded.functionName).toBe("approve");
    expect(decoded.args).toHaveLength(2);
    expect(decoded.args[0]).toEqual(generalAdapter1);
    expect(decoded.args[1]).toEqual(mockAmount);
  });

  test.each([
    { name: "GeneralAdapter1", spender: generalAdapter1 },
    { name: "Permit2", spender: permit2 },
    { name: "the Iris core", spender: iris },
  ])("behavior: encodes an approval for $name", ({ spender }) => {
    const transaction = encodeErc20Approval({
      token: USDC,
      spender,
      amount: mockAmount,
      chainId: CHAIN_ID,
    });

    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: transaction.data,
    });

    expect(decoded.args[0]).toEqual(spender);
    expect(transaction.action.args.spender).toEqual(spender);
  });

  test("behavior: caps the amount at the token's maximum approval", () => {
    const [token, cap] = Object.entries(MAX_TOKEN_APPROVALS[CHAIN_ID] ?? {})[0] as [
      Address,
      bigint,
    ];

    const transaction = encodeErc20Approval({
      token,
      spender: generalAdapter1,
      amount: maxUint256,
      chainId: CHAIN_ID,
    });

    expect(transaction.action.args.amount).toEqual(cap);
    expect(decodeFunctionData({ abi: erc20Abi, data: transaction.data }).args[1]).toEqual(cap);
  });

  test("behavior: leaves uncapped tokens at the requested amount", () => {
    const transaction = encodeErc20Approval({
      token: USDC,
      spender: generalAdapter1,
      amount: maxUint256,
      chainId: CHAIN_ID,
    });

    expect(transaction.action.args.amount).toEqual(maxUint256);
  });

  test("should work with zero amount", () => {
    const transaction = encodeErc20Approval({
      token: USDC,
      spender: generalAdapter1,
      amount: 0n,
      chainId: CHAIN_ID,
    });

    expect(transaction.action.args.amount).toEqual(0n);

    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: transaction.data,
    });
    expect(decoded.args[1]).toEqual(0n);
  });

  test("behavior: returns a deep-frozen transaction", () => {
    const transaction = encodeErc20Approval({
      token: USDC,
      spender: generalAdapter1,
      amount: mockAmount,
      chainId: CHAIN_ID,
    });

    expect(Object.isFrozen(transaction)).toBe(true);
    expect(Object.isFrozen(transaction.action)).toBe(true);
    expect(Object.isFrozen(transaction.action.args)).toBe(true);
  });

  test("should reject unsupported spender", () => {
    expect(() =>
      encodeErc20Approval({
        token: USDC,
        spender: ROGUE,
        amount: mockAmount,
        chainId: CHAIN_ID,
      }),
    ).toThrow(UnsupportedErc20ApprovalSpenderError);
  });
});

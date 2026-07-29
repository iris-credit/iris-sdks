import { decodeFunctionData, maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { CHAIN_ID, DEBT_TOKEN, POD, RECEIVER } from "../../../test/fixtures/iris.js";
import { callNames, decodeBundle } from "../../../test/helpers/iris.js";
import { generalAdapter1 as generalAdapter1Abi } from "../../abis/index.js";
import { NegativeInputError, NonPositiveInputError } from "../../types/index.js";
import { irisRepay } from "./repay.js";

const {
  wNative,
  bundler3: { bundler3 },
} = getChainAddresses(CHAIN_ID);

describe("irisRepay", () => {
  test("default: funds the debt pull and sweeps the residual", () => {
    const tx = irisRepay({
      chainId: CHAIN_ID,
      args: { pod: POD, token: DEBT_TOKEN, receiver: RECEIVER, amount: 1_000_000n },
    });

    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(0n);
    expect(tx.action.type).toBe("irisRepay");
    expect(tx.action.args).toEqual({
      pod: POD,
      token: DEBT_TOKEN,
      transferAmount: 1_000_000n,
      receiver: RECEIVER,
      nativeAmount: undefined,
    });

    const calls = decodeBundle(tx.data);

    expect(callNames(calls)).toEqual(["erc20TransferFrom", "irisRepay", "erc20Transfer"]);
    expect(decodeFunctionData({ abi: generalAdapter1Abi, data: calls[1]!.data }).args).toEqual([
      POD,
      DEBT_TOKEN,
    ]);
    // The sweep returns whatever the execution-priced pull left in the adapter.
    expect(decodeFunctionData({ abi: generalAdapter1Abi, data: calls[2]!.data }).args).toEqual([
      DEBT_TOKEN,
      RECEIVER,
      maxUint256,
    ]);
  });

  test("behavior: wraps a native funding before the repay", () => {
    const tx = irisRepay({
      chainId: CHAIN_ID,
      args: { pod: POD, token: wNative, receiver: RECEIVER, nativeAmount: 1_000n },
    });

    expect(tx.value).toBe(1_000n);
    expect(callNames(decodeBundle(tx.data))).toEqual([
      "nativeTransfer",
      "wrapNative",
      "irisRepay",
      "erc20Transfer",
    ]);
  });

  test("behavior: combines ERC-20 and native funding", () => {
    const tx = irisRepay({
      chainId: CHAIN_ID,
      args: { pod: POD, token: wNative, receiver: RECEIVER, amount: 400n, nativeAmount: 600n },
    });

    expect(tx.value).toBe(600n);
    expect(tx.action.args.transferAmount).toBe(1_000n);
    expect(callNames(decodeBundle(tx.data))).toEqual([
      "nativeTransfer",
      "wrapNative",
      "erc20TransferFrom",
      "irisRepay",
      "erc20Transfer",
    ]);
  });

  test("error: NegativeInputError when amount is negative", () => {
    expect(() =>
      irisRepay({
        chainId: CHAIN_ID,
        args: { pod: POD, token: DEBT_TOKEN, receiver: RECEIVER, amount: -1n },
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: NegativeInputError when nativeAmount is negative", () => {
    expect(() =>
      irisRepay({
        chainId: CHAIN_ID,
        args: { pod: POD, token: wNative, receiver: RECEIVER, nativeAmount: -1n },
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: NonPositiveInputError when nothing is funded", () => {
    expect(() =>
      irisRepay({
        chainId: CHAIN_ID,
        args: { pod: POD, token: DEBT_TOKEN, receiver: RECEIVER, amount: 0n },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("behavior: returns a deep-frozen transaction object", () => {
    const tx = irisRepay({
      chainId: CHAIN_ID,
      args: { pod: POD, token: DEBT_TOKEN, receiver: RECEIVER, amount: 1_000_000n },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });
});

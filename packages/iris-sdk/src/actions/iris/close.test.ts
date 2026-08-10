import { decodeFunctionData, maxUint256, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { CHAIN_ID, DEBT_TOKEN, POD, RECEIVER } from "../../../test/fixtures/iris.js";
import { authorizationSignature, callNames, decodeBundle } from "../../../test/helpers/iris.js";
import { generalAdapter1 as generalAdapter1Abi } from "../../abis/index.js";
import { NegativeInputError, NonPositiveInputError, ZeroAddressError } from "../../types/index.js";
import { irisClose } from "./close.js";

const {
  iris,
  wNative,
  bundler3: { bundler3 },
} = getChainAddresses(CHAIN_ID);

describe("irisClose", () => {
  test("default: funds the repayment, repays, exits the venue, then skims", () => {
    const tx = irisClose({
      chainId: CHAIN_ID,
      args: { pod: POD, token: DEBT_TOKEN, receiver: RECEIVER, amount: 1_000n },
    });

    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(0n);
    expect(tx.action.type).toBe("irisClose");
    expect(tx.action.args).toEqual({
      pod: POD,
      token: DEBT_TOKEN,
      transferAmount: 1_000n,
      receiver: RECEIVER,
      nativeAmount: undefined,
    });

    const calls = decodeBundle(tx.data);

    // Repay before escape: escape rejects a loan whose bond requirement is still standing.
    expect(callNames(calls)).toEqual([
      "erc20TransferFrom",
      "irisRepay",
      "irisEscape",
      "erc20Transfer",
    ]);
    expect(decodeFunctionData({ abi: generalAdapter1Abi, data: calls[2]!.data }).args).toEqual([
      POD,
      RECEIVER,
    ]);
    expect(decodeFunctionData({ abi: generalAdapter1Abi, data: calls[3]!.data }).args).toEqual([
      DEBT_TOKEN,
      RECEIVER,
      maxUint256,
    ]);
  });

  test("behavior: wraps a native funding before the repay", () => {
    const tx = irisClose({
      chainId: CHAIN_ID,
      args: { pod: POD, token: wNative, receiver: RECEIVER, nativeAmount: 1_000n },
    });

    expect(tx.value).toBe(1_000n);
    expect(tx.action.args.transferAmount).toBe(1_000n);
    // Fully native: no ERC-20 pull, but the escape leg and the sweep still run.
    expect(callNames(decodeBundle(tx.data))).toEqual([
      "nativeTransfer",
      "wrapNative",
      "irisRepay",
      "irisEscape",
      "erc20Transfer",
    ]);
  });

  test("behavior: prepends setAuthorizationWithSig when an authorization signature is provided", () => {
    const tx = irisClose({
      chainId: CHAIN_ID,
      args: {
        pod: POD,
        token: DEBT_TOKEN,
        receiver: RECEIVER,
        amount: 1_000n,
        authorizationSignature: authorizationSignature(),
      },
    });

    const calls = decodeBundle(tx.data);

    expect(calls[0]!.to).toBe(iris);
    expect(callNames(calls)).toEqual([
      "setAuthorizationWithSig",
      "erc20TransferFrom",
      "irisRepay",
      "irisEscape",
      "erc20Transfer",
    ]);
  });

  test("error: ZeroAddressError when the receiver is the zero address", () => {
    expect(() =>
      irisClose({
        chainId: CHAIN_ID,
        args: { pod: POD, token: DEBT_TOKEN, receiver: zeroAddress, amount: 1_000n },
      }),
    ).toThrow(ZeroAddressError);
  });

  test("error: NegativeInputError when amount is negative", () => {
    expect(() =>
      irisClose({
        chainId: CHAIN_ID,
        args: { pod: POD, token: DEBT_TOKEN, receiver: RECEIVER, amount: -1n },
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: NegativeInputError when nativeAmount is negative", () => {
    expect(() =>
      irisClose({
        chainId: CHAIN_ID,
        args: { pod: POD, token: wNative, receiver: RECEIVER, nativeAmount: -1n },
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: NonPositiveInputError when nothing funds the repayment", () => {
    expect(() =>
      irisClose({
        chainId: CHAIN_ID,
        args: { pod: POD, token: DEBT_TOKEN, receiver: RECEIVER, amount: 0n },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("behavior: returns a deep-frozen transaction object", () => {
    const tx = irisClose({
      chainId: CHAIN_ID,
      args: { pod: POD, token: DEBT_TOKEN, receiver: RECEIVER, amount: 1_000n },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });
});

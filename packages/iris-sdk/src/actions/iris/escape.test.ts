import { decodeFunctionData, maxUint256, zeroAddress } from "viem";
import { describe, expect, test } from "vitest";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { CHAIN_ID, DEBT_TOKEN, POD, RECEIVER } from "../../../test/fixtures/iris.js";
import { authorizationSignature, callNames, decodeBundle } from "../../../test/helpers/iris.js";
import { generalAdapter1 as generalAdapter1Abi } from "../../abis/index.js";
import { NegativeInputError, ZeroAddressError } from "../../types/index.js";
import { irisEscape } from "./escape.js";

const {
  iris,
  wNative,
  bundler3: { bundler3 },
} = getChainAddresses(CHAIN_ID);

describe("irisEscape", () => {
  test("default: exits the venue without funding", () => {
    const tx = irisEscape({
      chainId: CHAIN_ID,
      args: { pod: POD, token: DEBT_TOKEN, receiver: RECEIVER },
    });

    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(0n);
    expect(tx.action.type).toBe("irisEscape");
    expect(tx.action.args).toEqual({
      pod: POD,
      token: DEBT_TOKEN,
      transferAmount: 0n,
      receiver: RECEIVER,
      nativeAmount: undefined,
    });

    const calls = decodeBundle(tx.data);

    // A fully repaid venue leaves a pure collateral withdrawal — no funding, no sweep.
    expect(callNames(calls)).toEqual(["irisEscape"]);
    expect(decodeFunctionData({ abi: generalAdapter1Abi, data: calls[0]!.data }).args).toEqual([
      POD,
      RECEIVER,
    ]);
  });

  test("behavior: funds the venue debt and skims the residual", () => {
    const tx = irisEscape({
      chainId: CHAIN_ID,
      args: { pod: POD, token: DEBT_TOKEN, receiver: RECEIVER, amount: 1_000n },
    });

    expect(tx.action.args.transferAmount).toBe(1_000n);

    const calls = decodeBundle(tx.data);

    expect(callNames(calls)).toEqual(["erc20TransferFrom", "irisEscape", "erc20Transfer"]);
    expect(decodeFunctionData({ abi: generalAdapter1Abi, data: calls[2]!.data }).args).toEqual([
      DEBT_TOKEN,
      RECEIVER,
      maxUint256,
    ]);
  });

  test("behavior: wraps a native funding before the escape", () => {
    const tx = irisEscape({
      chainId: CHAIN_ID,
      args: { pod: POD, token: wNative, receiver: RECEIVER, nativeAmount: 1_000n },
    });

    expect(tx.value).toBe(1_000n);
    expect(callNames(decodeBundle(tx.data))).toEqual([
      "nativeTransfer",
      "wrapNative",
      "irisEscape",
      "erc20Transfer",
    ]);
  });

  test("behavior: prepends setAuthorizationWithSig when an authorization signature is provided", () => {
    const tx = irisEscape({
      chainId: CHAIN_ID,
      args: {
        pod: POD,
        token: DEBT_TOKEN,
        receiver: RECEIVER,
        authorizationSignature: authorizationSignature(),
      },
    });

    const calls = decodeBundle(tx.data);

    expect(calls[0]!.to).toBe(iris);
    expect(callNames(calls)).toEqual(["setAuthorizationWithSig", "irisEscape"]);
  });

  test("error: ZeroAddressError when the receiver is the zero address", () => {
    expect(() =>
      irisEscape({
        chainId: CHAIN_ID,
        args: { pod: POD, token: DEBT_TOKEN, receiver: zeroAddress },
      }),
    ).toThrow(ZeroAddressError);
  });

  test("error: NegativeInputError when amount is negative", () => {
    expect(() =>
      irisEscape({
        chainId: CHAIN_ID,
        args: { pod: POD, token: DEBT_TOKEN, receiver: RECEIVER, amount: -1n },
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: NegativeInputError when nativeAmount is negative", () => {
    expect(() =>
      irisEscape({
        chainId: CHAIN_ID,
        args: { pod: POD, token: wNative, receiver: RECEIVER, nativeAmount: -1n },
      }),
    ).toThrow(NegativeInputError);
  });

  test("behavior: returns a deep-frozen transaction object", () => {
    const tx = irisEscape({
      chainId: CHAIN_ID,
      args: { pod: POD, token: DEBT_TOKEN, receiver: RECEIVER },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });
});

import { decodeFunctionData, maxUint256 } from "viem";
import { describe, expect, test } from "vitest";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { CHAIN_ID, DEBT_TOKEN, POD, RECEIVER } from "../../../test/fixtures/iris.js";
import { authorizationSignature, callNames, decodeBundle } from "../../../test/helpers/iris.js";
import { generalAdapter1 as generalAdapter1Abi } from "../../abis/index.js";
import { NegativeInputError, NonPositiveInputError } from "../../types/index.js";
import { irisRefinance } from "./refinance.js";

const {
  iris,
  wNative,
  bundler3: { bundler3 },
} = getChainAddresses(CHAIN_ID);

const newVenueId = 1n;
const venueData = "0x1234" as const;

describe("irisRefinance", () => {
  test("default: funds the venue debt, refinances and skims the residual", () => {
    const tx = irisRefinance({
      chainId: CHAIN_ID,
      args: {
        pod: POD,
        token: DEBT_TOKEN,
        receiver: RECEIVER,
        amount: 1_000n,
        newVenueId,
        data: venueData,
      },
    });

    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(0n);
    expect(tx.action.type).toBe("irisRefinance");
    expect(tx.action.args).toEqual({
      pod: POD,
      token: DEBT_TOKEN,
      transferAmount: 1_000n,
      receiver: RECEIVER,
      newVenueId,
      data: venueData,
      nativeAmount: undefined,
    });

    const calls = decodeBundle(tx.data);

    expect(callNames(calls)).toEqual(["erc20TransferFrom", "irisRefinance", "erc20Transfer"]);
    expect(decodeFunctionData({ abi: generalAdapter1Abi, data: calls[1]!.data }).args).toEqual([
      POD,
      RECEIVER,
      newVenueId,
      venueData,
    ]);
    // The funding is an upper-bound estimate; the sweep returns what the pull left behind.
    expect(decodeFunctionData({ abi: generalAdapter1Abi, data: calls[2]!.data }).args).toEqual([
      DEBT_TOKEN,
      RECEIVER,
      maxUint256,
    ]);
  });

  test("behavior: wraps a native funding before the refinance", () => {
    const tx = irisRefinance({
      chainId: CHAIN_ID,
      args: {
        pod: POD,
        token: wNative,
        receiver: RECEIVER,
        nativeAmount: 1_000n,
        newVenueId,
        data: venueData,
      },
    });

    expect(tx.value).toBe(1_000n);
    expect(callNames(decodeBundle(tx.data))).toEqual([
      "nativeTransfer",
      "wrapNative",
      "irisRefinance",
      "erc20Transfer",
    ]);
  });

  test("behavior: prepends setAuthorizationWithSig when an authorization signature is provided", () => {
    const tx = irisRefinance({
      chainId: CHAIN_ID,
      args: {
        pod: POD,
        token: DEBT_TOKEN,
        receiver: RECEIVER,
        amount: 1_000n,
        newVenueId,
        data: venueData,
        authorizationSignature: authorizationSignature(),
      },
    });

    const calls = decodeBundle(tx.data);

    expect(calls[0]!.to).toBe(iris);
    expect(callNames(calls)).toEqual([
      "setAuthorizationWithSig",
      "erc20TransferFrom",
      "irisRefinance",
      "erc20Transfer",
    ]);
  });

  test("error: NegativeInputError when amount is negative", () => {
    expect(() =>
      irisRefinance({
        chainId: CHAIN_ID,
        args: {
          pod: POD,
          token: DEBT_TOKEN,
          receiver: RECEIVER,
          amount: -1n,
          newVenueId,
          data: venueData,
        },
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: NegativeInputError when nativeAmount is negative", () => {
    expect(() =>
      irisRefinance({
        chainId: CHAIN_ID,
        args: {
          pod: POD,
          token: wNative,
          receiver: RECEIVER,
          nativeAmount: -1n,
          newVenueId,
          data: venueData,
        },
      }),
    ).toThrow(NegativeInputError);
  });

  test("error: NonPositiveInputError when nothing is funded", () => {
    expect(() =>
      irisRefinance({
        chainId: CHAIN_ID,
        args: {
          pod: POD,
          token: DEBT_TOKEN,
          receiver: RECEIVER,
          amount: 0n,
          newVenueId,
          data: venueData,
        },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("behavior: returns a deep-frozen transaction object", () => {
    const tx = irisRefinance({
      chainId: CHAIN_ID,
      args: {
        pod: POD,
        token: DEBT_TOKEN,
        receiver: RECEIVER,
        amount: 1_000n,
        newVenueId,
        data: venueData,
      },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });
});

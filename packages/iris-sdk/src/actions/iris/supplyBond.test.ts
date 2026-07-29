import { decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { CHAIN_ID, DEBT_TOKEN, POD } from "../../../test/fixtures/iris.js";
import { callNames, decodeBundle } from "../../../test/helpers/iris.js";
import { generalAdapter1 as generalAdapter1Abi } from "../../abis/index.js";
import { NegativeInputError, NonPositiveInputError } from "../../types/index.js";
import { irisSupplyBond } from "./supplyBond.js";

const {
  wNative,
  bundler3: { bundler3 },
} = getChainAddresses(CHAIN_ID);

describe("irisSupplyBond", () => {
  test("default: pulls the bond and supplies the funded total", () => {
    const tx = irisSupplyBond({
      chainId: CHAIN_ID,
      args: { pod: POD, token: DEBT_TOKEN, amount: 1_000n },
    });

    expect(tx.to).toBe(bundler3);
    expect(tx.value).toBe(0n);
    expect(tx.action.type).toBe("irisSupplyBond");
    expect(tx.action.args).toEqual({
      pod: POD,
      token: DEBT_TOKEN,
      amount: 1_000n,
      nativeAmount: undefined,
    });

    const calls = decodeBundle(tx.data);

    expect(callNames(calls)).toEqual(["erc20TransferFrom", "irisSupplyBond"]);
    expect(decodeFunctionData({ abi: generalAdapter1Abi, data: calls[1]!.data }).args).toEqual([
      POD,
      DEBT_TOKEN,
      1_000n,
    ]);
  });

  test("behavior: wraps a native funding before supplying", () => {
    const tx = irisSupplyBond({
      chainId: CHAIN_ID,
      args: { pod: POD, token: wNative, nativeAmount: 1_000n },
    });

    expect(tx.value).toBe(1_000n);
    expect(callNames(decodeBundle(tx.data))).toEqual([
      "nativeTransfer",
      "wrapNative",
      "irisSupplyBond",
    ]);
  });

  test("behavior: supplies the exact funded total for a mixed funding", () => {
    const tx = irisSupplyBond({
      chainId: CHAIN_ID,
      args: { pod: POD, token: wNative, amount: 400n, nativeAmount: 600n },
    });

    const calls = decodeBundle(tx.data);

    // The supplied amount is the funded total, never the adapter's maxUint256 sweep.
    expect(decodeFunctionData({ abi: generalAdapter1Abi, data: calls.at(-1)!.data }).args).toEqual([
      POD,
      wNative,
      1_000n,
    ]);
  });

  test("error: NegativeInputError when amount is negative", () => {
    expect(() =>
      irisSupplyBond({ chainId: CHAIN_ID, args: { pod: POD, token: DEBT_TOKEN, amount: -1n } }),
    ).toThrow(NegativeInputError);
  });

  test("error: NegativeInputError when nativeAmount is negative", () => {
    expect(() =>
      irisSupplyBond({ chainId: CHAIN_ID, args: { pod: POD, token: wNative, nativeAmount: -1n } }),
    ).toThrow(NegativeInputError);
  });

  test("error: NonPositiveInputError when nothing is funded", () => {
    expect(() =>
      irisSupplyBond({ chainId: CHAIN_ID, args: { pod: POD, token: DEBT_TOKEN, amount: 0n } }),
    ).toThrow(NonPositiveInputError);
  });

  test("behavior: returns a deep-frozen transaction object", () => {
    const tx = irisSupplyBond({
      chainId: CHAIN_ID,
      args: { pod: POD, token: DEBT_TOKEN, amount: 1_000n },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });
});

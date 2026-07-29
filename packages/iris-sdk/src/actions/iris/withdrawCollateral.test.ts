import { decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";
import { getChainAddresses, irisAbi } from "@iris-credit/core-sdk";
import { CHAIN_ID, POD, RECEIVER } from "../../../test/fixtures/iris.js";
import { NonPositiveInputError } from "../../types/index.js";
import { irisWithdrawCollateral } from "./withdrawCollateral.js";

const { iris } = getChainAddresses(CHAIN_ID);

describe("irisWithdrawCollateral", () => {
  test("default: calls Iris.withdrawCollateral directly", () => {
    const tx = irisWithdrawCollateral({
      chainId: CHAIN_ID,
      args: { pod: POD, amount: 1_000n, receiver: RECEIVER },
    });

    expect(tx.to).toBe(iris);
    expect(tx.value).toBe(0n);
    expect(tx.action.type).toBe("irisWithdrawCollateral");
    expect(tx.action.args).toEqual({ pod: POD, amount: 1_000n, receiver: RECEIVER });

    const decoded = decodeFunctionData({ abi: irisAbi, data: tx.data });

    expect(decoded.functionName).toBe("withdrawCollateral");
    expect(decoded.args).toEqual([POD, 1_000n, RECEIVER]);
  });

  test("error: NonPositiveInputError when amount is zero", () => {
    expect(() =>
      irisWithdrawCollateral({
        chainId: CHAIN_ID,
        args: { pod: POD, amount: 0n, receiver: RECEIVER },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NonPositiveInputError when amount is negative", () => {
    expect(() =>
      irisWithdrawCollateral({
        chainId: CHAIN_ID,
        args: { pod: POD, amount: -1n, receiver: RECEIVER },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("behavior: returns a deep-frozen transaction object", () => {
    const tx = irisWithdrawCollateral({
      chainId: CHAIN_ID,
      args: { pod: POD, amount: 1_000n, receiver: RECEIVER },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });
});

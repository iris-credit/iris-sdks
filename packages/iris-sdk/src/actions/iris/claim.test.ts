import { decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";
import { getChainAddresses, irisAbi } from "@iris-credit/core-sdk";
import { CHAIN_ID, DEBT_TOKEN, RECEIVER, SOLVER } from "../../../test/fixtures/iris.js";
import { NonPositiveInputError } from "../../types/index.js";
import { irisClaim } from "./claim.js";

const { iris } = getChainAddresses(CHAIN_ID);

describe("irisClaim", () => {
  test("default: calls Iris.claim directly", () => {
    const tx = irisClaim({
      chainId: CHAIN_ID,
      args: { token: DEBT_TOKEN, amount: 1_000n, onBehalf: SOLVER, receiver: RECEIVER },
    });

    expect(tx.to).toBe(iris);
    expect(tx.value).toBe(0n);
    expect(tx.action.type).toBe("irisClaim");
    expect(tx.action.args).toEqual({
      token: DEBT_TOKEN,
      amount: 1_000n,
      onBehalf: SOLVER,
      receiver: RECEIVER,
    });

    const decoded = decodeFunctionData({ abi: irisAbi, data: tx.data });

    expect(decoded.functionName).toBe("claim");
    expect(decoded.args).toEqual([DEBT_TOKEN, 1_000n, SOLVER, RECEIVER]);
  });

  test("error: NonPositiveInputError when amount is zero", () => {
    expect(() =>
      irisClaim({
        chainId: CHAIN_ID,
        args: { token: DEBT_TOKEN, amount: 0n, onBehalf: SOLVER, receiver: RECEIVER },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("error: NonPositiveInputError when amount is negative", () => {
    expect(() =>
      irisClaim({
        chainId: CHAIN_ID,
        args: { token: DEBT_TOKEN, amount: -1n, onBehalf: SOLVER, receiver: RECEIVER },
      }),
    ).toThrow(NonPositiveInputError);
  });

  test("behavior: returns a deep-frozen transaction object", () => {
    const tx = irisClaim({
      chainId: CHAIN_ID,
      args: { token: DEBT_TOKEN, amount: 1_000n, onBehalf: SOLVER, receiver: RECEIVER },
    });

    expect(Object.isFrozen(tx)).toBe(true);
    expect(Object.isFrozen(tx.action)).toBe(true);
    expect(Object.isFrozen(tx.action.args)).toBe(true);
  });
});

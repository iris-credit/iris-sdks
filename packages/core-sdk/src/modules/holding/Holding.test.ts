import { describe, expect, test } from "vitest";
import { DEBT_TOKEN, USER } from "../../../test/fixtures/iris.js";
import { Holding } from "./Holding.js";

describe("Holding", () => {
  test("constructor normalizes allowances", () => {
    const holding = new Holding({
      user: USER,
      token: DEBT_TOKEN,
      erc20Allowances: {
        iris: 1n,
        permit2: 2n,
      },
      permit2IrisAllowance: {
        amount: "3",
        expiration: 4,
        nonce: true,
      },
      permit2BundlerAllowance: {
        amount: "5",
        expiration: 6,
        nonce: false,
      },
      balance: 7n,
    });

    expect(holding.user).toBe(USER);
    expect(holding.token).toBe(DEBT_TOKEN);
    expect(holding.erc20Allowances).toStrictEqual({
      iris: 1n,
      permit2: 2n,
    });
    expect(holding.permit2IrisAllowance).toStrictEqual({
      amount: 3n,
      expiration: 4n,
      nonce: 1n,
    });
    expect(holding.permit2BundlerAllowance).toStrictEqual({
      amount: 5n,
      expiration: 6n,
      nonce: 0n,
    });
    expect(holding.balance).toBe(7n);
  });

  test("balance setter updates the stored balance", () => {
    const holding = new Holding({
      user: USER,
      token: DEBT_TOKEN,
      erc20Allowances: {
        iris: 0n,
        permit2: 0n,
      },
      permit2IrisAllowance: {
        amount: 0n,
        expiration: 0n,
        nonce: 0n,
      },
      permit2BundlerAllowance: {
        amount: 0n,
        expiration: 0n,
        nonce: 0n,
      },
      balance: 0n,
    });

    holding.balance = 42n;

    expect(holding.balance).toBe(42n);
  });
});

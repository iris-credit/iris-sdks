import { describe, expect, test } from "vitest";
import { loan, loanInput, MATURITY, OVERDUE_PERIOD } from "../../__test__/fixtures.js";
import { Loan } from "./Loan.js";
import { LoanUtils } from "./LoanUtils.js";

describe("Loan constructor and getters", () => {
  test("stores every input field", () => {
    const input = loanInput();

    expect({ ...new Loan(input) }).toStrictEqual(input);
  });

  test("exposes derived getters delegated to LoanUtils", () => {
    const input = loanInput();
    const l = new Loan(input);

    expect(l.bondLif).toBe(LoanUtils.getBondLif(input));
    expect(l.liquidatableAt).toBe(LoanUtils.liquidatableAt(input));
  });

  test("derived getters follow the overriden loan terms", () => {
    expect(loan({ bondLltv: 0n }).bondLif).toBe(LoanUtils.getBondLif(loanInput({ bondLltv: 0n })));
    expect(loan({ overduePeriod: 0n }).liquidatableAt).toBe(MATURITY + 1n);
  });

  test("delegates the liquidation incentive factor to LoanUtils", () => {
    const input = loanInput();
    const l = new Loan(input);
    const timestamp = MATURITY + OVERDUE_PERIOD + 450n;

    expect(l.getLif(timestamp)).toBe(LoanUtils.getLif(input, timestamp));
    expect(l.getLif(MATURITY)).toBe(0n);
  });

  test("delegates the maturity and liquidation predicates to LoanUtils", () => {
    const input = loanInput();
    const l = new Loan(input);
    const liquidatableAt = MATURITY + OVERDUE_PERIOD + 1n;

    expect(l.isOverdue(MATURITY)).toBe(LoanUtils.isOverdue(input, MATURITY));
    expect(l.isOverdue(MATURITY + 1n)).toBe(true);
    expect(l.isLiquidatable(liquidatableAt - 1n)).toBe(false);
    expect(l.isLiquidatable(liquidatableAt)).toBe(LoanUtils.isLiquidatable(input, liquidatableAt));
  });

  test("delegates the venue bitmap check to LoanUtils", () => {
    // The fixture bitmap is 0b101: venues 0 and 2 allowed, venue 1 not.
    const l = loan();

    expect(l.isVenueAllowed(0n)).toBe(true);
    expect(l.isVenueAllowed(1n)).toBe(false);
    expect(l.isVenueAllowed(2n)).toBe(true);
  });

  test("coerces BigIntish timestamps and venue ids at the API edge", () => {
    const l = loan();

    expect(l.isOverdue(`${MATURITY + 1n}`)).toBe(true);
    expect(l.isLiquidatable(Number(MATURITY + OVERDUE_PERIOD))).toBe(false);
    expect(l.getLif(Number(MATURITY + OVERDUE_PERIOD))).toBe(0n);
    expect(l.isVenueAllowed(2)).toBe(true);
  });
});

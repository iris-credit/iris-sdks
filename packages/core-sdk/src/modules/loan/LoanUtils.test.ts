import { describe, expect, test } from "vitest";
import { LoanUtils } from "./LoanUtils.js";

const MATURITY = 1_000_000n;
const OVERDUE_PERIOD = 86_400n;
const loan = { maturity: MATURITY, overduePeriod: OVERDUE_PERIOD };
const THRESHOLD = MATURITY + OVERDUE_PERIOD; // 1_086_400n — last healthy second
const FIRST_LIQUIDATABLE = THRESHOLD + 1n; // 1_086_401n

describe("LoanUtils", () => {
  describe("liquidatableAt", () => {
    test("should return the first liquidatable second (maturity + overduePeriod + 1)", () => {
      expect(LoanUtils.liquidatableAt(loan)).toBe(FIRST_LIQUIDATABLE);
    });

    test("should coerce BigIntish inputs", () => {
      expect(LoanUtils.liquidatableAt({ maturity: "1000000", overduePeriod: 86_400 })).toBe(
        FIRST_LIQUIDATABLE,
      );
    });
  });

  describe("isLiquidatable", () => {
    test("should not be liquidatable at the threshold (still healthy, Iris.liquidate reverts HealthyLoan)", () => {
      expect(LoanUtils.isLiquidatable(loan, THRESHOLD)).toBe(false);
    });

    test("should be liquidatable one second past the threshold", () => {
      expect(LoanUtils.isLiquidatable(loan, THRESHOLD + 1n)).toBe(true);
    });

    test("should not be liquidatable well before, and be liquidatable well after", () => {
      expect(LoanUtils.isLiquidatable(loan, MATURITY)).toBe(false);
      expect(LoanUtils.isLiquidatable(loan, THRESHOLD + 10_000n)).toBe(true);
    });

    test("should coerce the BigIntish timestamp", () => {
      expect(LoanUtils.isLiquidatable(loan, Number(THRESHOLD))).toBe(false);
      expect(LoanUtils.isLiquidatable(loan, `${THRESHOLD + 1n}`)).toBe(true);
    });
  });

  describe("isOverdue", () => {
    test("should not be overdue at maturity, and be overdue one second past (strict >)", () => {
      expect(LoanUtils.isOverdue({ maturity: MATURITY }, MATURITY)).toBe(false);
      expect(LoanUtils.isOverdue({ maturity: MATURITY }, MATURITY + 1n)).toBe(true);
    });
  });

  describe("isVenueAllowed", () => {
    test("should read the venueId-th bit of the bitmap", () => {
      expect(LoanUtils.isVenueAllowed({ venueBitmap: 0b101n }, 0n)).toBe(true);
      expect(LoanUtils.isVenueAllowed({ venueBitmap: 0b101n }, 1n)).toBe(false);
      expect(LoanUtils.isVenueAllowed({ venueBitmap: 0b101n }, 2n)).toBe(true);
    });
  });
});

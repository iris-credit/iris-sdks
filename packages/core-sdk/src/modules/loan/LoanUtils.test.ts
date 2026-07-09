import { describe, expect, test } from "vitest";
import { MAX_BOND_LIF, MAX_LIF } from "../../constants.js";
import { MathLib } from "../../math/index.js";
import { LoanUtils } from "./LoanUtils.js";

const MATURITY = 1_000_000n;
const OVERDUE_PERIOD = 86_400n;
const loan = { maturity: MATURITY, overduePeriod: OVERDUE_PERIOD };
const THRESHOLD = MATURITY + OVERDUE_PERIOD; // 1_086_400n — last healthy second
const FIRST_LIQUIDATABLE = THRESHOLD + 1n; // 1_086_401n

describe("LoanUtils", () => {
  describe("getLif", () => {
    const liquidatableAt = MATURITY + OVERDUE_PERIOD;

    test("should grow linearly from 0 at maturity + overduePeriod", () => {
      expect(LoanUtils.getLif(loan, liquidatableAt)).toBe(0n);
      // 0.15e18 * 450 / 900 = 0.075e18.
      expect(LoanUtils.getLif(loan, liquidatableAt + 450n)).toBe(75_000_000_000_000_000n);
    });

    test("should floor the growth", () => {
      // 0.15e18 * 1 / 900 = 166_666_666_666_666.67 floors.
      expect(LoanUtils.getLif(loan, liquidatableAt + 1n)).toBe(166_666_666_666_666n);
    });

    test("should cap at MAX_LIF from TIME_TO_MAX_LIF onwards", () => {
      expect(LoanUtils.getLif(loan, liquidatableAt + 900n)).toBe(MAX_LIF);
      expect(LoanUtils.getLif(loan, liquidatableAt + 10_000n)).toBe(MAX_LIF);
    });

    test("should clamp to 0 while the loan is not liquidatable", () => {
      // The contract reverts with HealthyLoan in this range instead.
      expect(LoanUtils.getLif(loan, 500_000n)).toBe(0n);
    });
  });

  describe("getBondLif", () => {
    test("should cap at MAX_BOND_LIF for low lltvs", () => {
      // lltv 0: 1 / (1 - 0.5) - 1 = 1 MathLib.WAD, capped.
      expect(LoanUtils.getBondLif({ bondLltv: 0n })).toBe(MAX_BOND_LIF);
      // lltv 0.9: 1e36 / 0.95e18 - 1e18 = 52_631_578_947_368_421 > 0.05e18, capped.
      expect(LoanUtils.getBondLif({ bondLltv: 900_000_000_000_000_000n })).toBe(MAX_BOND_LIF);
    });

    test("should floor 1 / (1 - cursor * (1 - bondLltv)) - 1", () => {
      // lltv 0.95: 1e36 / 0.975e18 = 1_025_641_025_641_025_641.02... floors, minus MathLib.WAD.
      expect(LoanUtils.getBondLif({ bondLltv: 950_000_000_000_000_000n })).toBe(
        25_641_025_641_025_641n,
      );
    });

    test("should be zero at a 100% lltv", () => {
      expect(LoanUtils.getBondLif({ bondLltv: MathLib.WAD })).toBe(0n);
    });
  });

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

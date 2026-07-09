import type { LifecycleEventKind } from "./LoanStatus.js";

import { describe, expect, test } from "vitest";
import {
  LIFECYCLE_EVENT_KINDS,
  LOAN_STATUSES,
  deriveStatus,
  isLifecycleEventKind,
} from "./LoanStatus.js";

const MATURITY = 1_000n;
const OVERDUE_PERIOD = 100n;

const alive = { debt: 1n, maturity: MATURITY, overduePeriod: OVERDUE_PERIOD };
const settled = { debt: 0n, maturity: MATURITY, overduePeriod: OVERDUE_PERIOD };
const none = new Set<LifecycleEventKind>();

describe("loan status vocabulary", () => {
  test("should expose the contract values", () => {
    expect(LOAN_STATUSES).toEqual(["active", "overdue", "defaulted", "bond_liquidated", "closed"]);
    expect(LIFECYCLE_EVENT_KINDS).toEqual([
      "Take",
      "Repay",
      "Liquidate",
      "LiquidateBond",
      "Escape",
      "Rebase",
      "Refinance",
    ]);
  });
});

describe("isLifecycleEventKind", () => {
  test("should accept every vocabulary kind and reject anything else", () => {
    for (const kind of LIFECYCLE_EVENT_KINDS) {
      expect(isLifecycleEventKind(kind)).toBe(true);
    }

    expect(isLifecycleEventKind("repay")).toBe(false);
    expect(isLifecycleEventKind("")).toBe(false);
    expect(isLifecycleEventKind(null)).toBe(false);
  });
});

describe("deriveStatus", () => {
  describe("debt > 0: numbers decide aliveness", () => {
    test("should be active before maturity", () => {
      expect(deriveStatus(alive, none, MATURITY - 1n)).toEqual({
        status: "active",
        closureCause: null,
      });
    });

    test("should still be active at exactly maturity", () => {
      expect(deriveStatus(alive, none, MATURITY)).toEqual({
        status: "active",
        closureCause: null,
      });
    });

    test("should be overdue after maturity", () => {
      expect(deriveStatus(alive, none, MATURITY + 1n)).toEqual({
        status: "overdue",
        closureCause: null,
      });
    });

    test("should still be overdue at exactly maturity + overduePeriod", () => {
      expect(deriveStatus(alive, none, MATURITY + OVERDUE_PERIOD)).toEqual({
        status: "overdue",
        closureCause: null,
      });
    });

    test("should be defaulted after maturity + overduePeriod", () => {
      expect(deriveStatus(alive, none, MATURITY + OVERDUE_PERIOD + 1n)).toEqual({
        status: "defaulted",
        closureCause: null,
      });
    });

    test("should ignore lifecycle events while debt is outstanding", () => {
      expect(deriveStatus(alive, new Set(["Take", "Repay", "LiquidateBond"]), MATURITY)).toEqual({
        status: "active",
        closureCause: null,
      });
    });
  });

  describe("debt = 0: the diary decides the cause", () => {
    test("should be bond_liquidated when the bond was seized but not escaped", () => {
      expect(deriveStatus(settled, new Set(["Take", "LiquidateBond"]), MATURITY)).toEqual({
        status: "bond_liquidated",
        closureCause: "bond_liquidated",
      });
    });

    test("should be closed once the stranded collateral is escaped", () => {
      expect(deriveStatus(settled, new Set(["Take", "LiquidateBond", "Escape"]), MATURITY)).toEqual(
        { status: "closed", closureCause: "bond_liquidated" },
      );
    });

    test("should be closed as repaid", () => {
      expect(deriveStatus(settled, new Set(["Take", "Repay"]), MATURITY)).toEqual({
        status: "closed",
        closureCause: "repaid",
      });
    });

    test("should be closed as liquidated", () => {
      expect(deriveStatus(settled, new Set(["Take", "Liquidate"]), MATURITY)).toEqual({
        status: "closed",
        closureCause: "liquidated",
      });
    });

    test("should be closed as bad_debt on rebase", () => {
      expect(deriveStatus(settled, new Set(["Take", "Rebase"]), MATURITY)).toEqual({
        status: "closed",
        closureCause: "bad_debt",
      });
    });

    test("should be closed without a cause when no closer was recorded", () => {
      expect(deriveStatus(settled, none, MATURITY)).toEqual({
        status: "closed",
        closureCause: null,
      });
      expect(deriveStatus(settled, new Set(["Take", "Refinance"]), MATURITY)).toEqual({
        status: "closed",
        closureCause: null,
      });
    });

    test("should not depend on time once debt is zero", () => {
      expect(deriveStatus(settled, new Set(["Repay"]), MATURITY + OVERDUE_PERIOD + 1n)).toEqual({
        status: "closed",
        closureCause: "repaid",
      });
    });
  });
});

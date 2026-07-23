import type { VenueIndices } from "../venue/Venue.js";

import { describe, expect, test } from "vitest";
import { SECONDS_PER_YEAR } from "../../constants.js";
import { IrisCoreErrors } from "../../errors.js";
import { MathLib } from "../../math/index.js";
import { Loan } from "../loan/Loan.js";
import { Venue } from "../venue/Venue.js";
import { AccrualPosition, Position } from "./Position.js";

/** Venue stub returning fixed indices, so accrual math is exercised with exact values. */
class TestVenue extends Venue {
  constructor(private readonly values: VenueIndices) {
    super();
  }

  public indices(): VenueIndices {
    return { ...this.values };
  }
}

const loan = {
  borrower: "0x0000000000000000000000000000000000000001",
  solver: "0x0000000000000000000000000000000000000002",
  collateralToken: "0x0000000000000000000000000000000000000003",
  debtToken: "0x0000000000000000000000000000000000000004",
  venueBitmap: 1n,
  maturity: 2_000_000n + SECONDS_PER_YEAR / 2n,
  overduePeriod: 3_600n,
  fixedRate: 100_000_000_000_000_000n,
  overdueRate: 200_000_000_000_000_000n,
  bondLltv: 500_000_000_000_000_000n,
  fee: 0n,
} as const;

const position = {
  pod: "0x0000000000000000000000000000000000000005",
  collateral: 2n * MathLib.WAD,
  debt: MathLib.WAD,
  bond: 100_000_000_000_000_000n,
  bondRequirement: 1n,
  collateralIndex: MathLib.WAD,
  debtIndex: MathLib.WAD,
  fixedLeg: 0n,
  floatingLeg: 0n,
  surplus: 0n,
  lastUpdate: 2_000_000n,
  venueId: 0n,
  data: "0x",
} as const;

const venue = new TestVenue({ collateralIndex: MathLib.WAD, debtIndex: MathLib.WAD });

describe("Position", () => {
  test("default", () => {
    const value = new Position(position);

    expect(value).toEqual(position);
  });
});

describe("AccrualPosition", () => {
  const accrualPosition = new AccrualPosition(position, loan, venue);

  test("should hydrate the loan entity and expose the venue", () => {
    expect(accrualPosition.loan).toBeInstanceOf(Loan);
    expect(accrualPosition.loan.fixedRate).toBe(loan.fixedRate);
    expect(accrualPosition.venue).toBe(venue);
  });

  describe("accrueInterest", () => {
    test("should accrue the legs to the given timestamp against the projected indices", () => {
      const value = new AccrualPosition(
        position,
        loan,
        new TestVenue({
          collateralIndex: 1_050_000_000_000_000_000n,
          debtIndex: 1_100_000_000_000_000_000n,
        }),
      ).accrueInterest(position.lastUpdate + SECONDS_PER_YEAR / 4n);

      // 10% over a quarter year on a WAD debt.
      expect(value.fixedLeg).toBe(25_000_000_000_000_000n);
      // (1 + 0) * (1.1 - 1) / 1.
      expect(value.floatingLeg).toBe(100_000_000_000_000_000n);
      // (2 + 0) * (1.05 - 1) / 1, accrued while the loan is open (bondRequirement != 0).
      expect(value.surplus).toBe(100_000_000_000_000_000n);
      expect(value.collateralIndex).toBe(1_050_000_000_000_000_000n);
      expect(value.debtIndex).toBe(1_100_000_000_000_000_000n);
      expect(value.lastUpdate).toBe(position.lastUpdate + SECONDS_PER_YEAR / 4n);
    });

    test("should throw when the projected indices regress below the stored indices", () => {
      // A projection below the stored indices means inconsistent inputs (e.g. a venue fetched
      // before the position's last update) — surfaced as an error, never silently re-anchored.
      const value = new AccrualPosition(
        position,
        loan,
        new TestVenue({ collateralIndex: MathLib.WAD - 1n, debtIndex: MathLib.WAD - 1n }),
      );

      expect(() => value.accrueInterest(position.lastUpdate + 1_000n)).toThrow(
        IrisCoreErrors.InvalidVenueIndex,
      );
    });

    test("should return a new instance and leave this untouched", () => {
      const value = accrualPosition.accrueInterest(position.lastUpdate + 1_000n);

      expect(value).not.toBe(accrualPosition);
      expect(accrualPosition.lastUpdate).toBe(position.lastUpdate);
      expect(accrualPosition.fixedLeg).toBe(0n);
    });

    test("should keep a never-created position at lastUpdate zero", () => {
      const value = new AccrualPosition(
        { ...position, lastUpdate: 0n },
        loan,
        venue,
      ).accrueInterest(2_000_000n);

      expect(value.lastUpdate).toBe(0n);
      expect(value.fixedLeg).toBe(0n);
    });
  });

  describe("getRepaid", () => {
    test("should charge the debt and the full-term fixed leg before maturity", () => {
      // Accrued 0.025 + residual 0.025: the fixed interest of the whole remaining term.
      expect(accrualPosition.getRepaid(position.lastUpdate + SECONDS_PER_YEAR / 4n)).toBe(
        MathLib.WAD + 50_000_000_000_000_000n,
      );
    });
  });

  describe("isHealthyBond", () => {
    test("should be unhealthy when the bond does not cover the requirement", () => {
      const value = new AccrualPosition(
        { ...position, bondRequirement: position.bond + 1n },
        loan,
        venue,
      );

      expect(value.isHealthyBond).toBe(false);
    });
  });
});

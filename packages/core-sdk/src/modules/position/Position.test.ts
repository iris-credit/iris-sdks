import { describe, expect, test } from "vitest";
import { ORACLE_PRICE_SCALE, SECONDS_PER_YEAR } from "../../constants.js";
import { IrisCoreErrors } from "../../errors.js";
import { MathLib } from "../../math/index.js";
import { Loan } from "../loan/Loan.js";
import { Venue } from "../venue/Venue.js";
import { AccrualPosition, Position } from "./Position.js";

/** Concrete venue stub with identity accrual: fixtures hold the venue at the evaluated time. */
class TestVenue extends Venue {
  public accrueInterest() {
    return this;
  }

  public getAccrualCollateral() {
    return this.collateral;
  }

  public getAccrualDebt() {
    return this.debt;
  }

  public getAccrualCollateralIndex() {
    return this.collateralIndex;
  }

  public getAccrualDebtIndex() {
    return this.debtIndex;
  }
}

const loan = {
  pod: "0x0000000000000000000000000000000000000005",
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
  fee: 200_000_000_000_000_000n,
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

// Venue assets match the tracked collateral + surplus and debt + floating leg: no rebase.
const venue = new TestVenue({
  pod: "0x0000000000000000000000000000000000000005",
  collateral: 2n * MathLib.WAD,
  debt: MathLib.WAD,
  collateralIndex: MathLib.WAD,
  debtIndex: MathLib.WAD,
  lltv: 800_000_000_000_000_000n,
  price: ORACLE_PRICE_SCALE,
  lastUpdate: 2_000_000n,
});

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

  test("should throw when the loan or the venue is of another pod", () => {
    const pod = "0x0000000000000000000000000000000000000006";

    expect(() => new AccrualPosition(position, { ...loan, pod }, venue)).toThrow(
      IrisCoreErrors.UnexpectedPod,
    );
    expect(() => new AccrualPosition(position, loan, new TestVenue({ ...venue, pod }))).toThrow(
      IrisCoreErrors.UnexpectedPod,
    );
  });

  describe("accrueLegs", () => {
    test("should accrue the legs to the given timestamp against the venue indices", () => {
      const value = new AccrualPosition(
        position,
        loan,
        new TestVenue({
          ...venue,
          collateralIndex: 1_050_000_000_000_000_000n,
          debtIndex: 1_100_000_000_000_000_000n,
        }),
      ).accrueLegs(position.lastUpdate + SECONDS_PER_YEAR / 4n);

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

    test("should throw when the timestamp is prior to the last update", () => {
      expect(() => accrualPosition.accrueLegs(position.lastUpdate - 1n)).toThrow(
        IrisCoreErrors.InvalidInterestAccrual,
      );
    });

    test("should throw when a venue index is prior to the stored index", () => {
      expect(() =>
        new AccrualPosition(
          position,
          loan,
          new TestVenue({ ...venue, collateralIndex: MathLib.WAD - 1n }),
        ).accrueLegs(position.lastUpdate + 1_000n),
      ).toThrow(IrisCoreErrors.InvalidVenueIndex);
      expect(() =>
        new AccrualPosition(
          position,
          loan,
          new TestVenue({ ...venue, debtIndex: MathLib.WAD - 1n }),
        ).accrueLegs(position.lastUpdate + 1_000n),
      ).toThrow(IrisCoreErrors.InvalidVenueIndex);
    });

    test("should return a new instance and leave this untouched", () => {
      const value = accrualPosition.accrueLegs(position.lastUpdate + 1_000n);

      expect(value).not.toBe(accrualPosition);
      expect(accrualPosition.lastUpdate).toBe(position.lastUpdate);
      expect(accrualPosition.fixedLeg).toBe(0n);
    });
  });

  describe("rebase", () => {
    test("should return the position unchanged when the venue saw no event", () => {
      const value = accrualPosition.rebase();

      expect(value?.collateral).toBe(position.collateral);
      expect(value?.debt).toBe(position.debt);
      expect(value?.bondRequirement).toBe(position.bondRequirement);
    });

    test("should track an external liquidation", () => {
      // liquidated = 2 - 1 and repaid = 1 - 0.5 at a 1:1 price: no bad debt.
      const value = new AccrualPosition(
        position,
        loan,
        new TestVenue({ ...venue, collateral: MathLib.WAD, debt: MathLib.WAD / 2n }),
      ).rebase();

      expect(value?.collateral).toBe(MathLib.WAD);
      expect(value?.debt).toBe(MathLib.WAD / 2n);
      expect(value?.bondRequirement).toBe(position.bondRequirement);
    });

    test("should return undefined when the price is unknown", () => {
      expect(
        new AccrualPosition(
          position,
          loan,
          new TestVenue({
            ...venue,
            collateral: MathLib.WAD,
            debt: MathLib.WAD / 2n,
            price: undefined,
          }),
        ).rebase(),
      ).toBeUndefined();
    });
  });

  describe("settleLegs", () => {
    test("should credit the residual and return the settlement", () => {
      // 10% over the half year to maturity: a 0.05 * debt residual, with a 20% fee cut.
      const { position: settled, net, performanceFee, surplusFee } = accrualPosition.settleLegs();

      expect(settled.fixedLeg).toBe(50_000_000_000_000_000n);
      expect(net).toBe(50_000_000_000_000_000n);
      expect(performanceFee).toBe(10_000_000_000_000_000n);
      expect(surplusFee).toBe(0n);
      // The original position is left unchanged.
      expect(accrualPosition.fixedLeg).toBe(0n);
    });
  });
});

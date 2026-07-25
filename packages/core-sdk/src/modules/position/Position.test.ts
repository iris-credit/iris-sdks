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

  public supplyCollateral(amount: bigint) {
    return new TestVenue({ ...this, collateral: this.collateral + amount });
  }

  public withdrawCollateral(amount: bigint) {
    return new TestVenue({ ...this, collateral: this.collateral - amount });
  }

  public repay(amount: bigint) {
    return new TestVenue({ ...this, debt: this.debt - amount });
  }

  public borrow(amount: bigint) {
    return new TestVenue({ ...this, debt: this.debt + amount });
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
  id: 0n,
  data: "0x",
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

  test("should throw when the venue is not the one the position is held on", () => {
    expect(() => new AccrualPosition(position, loan, new TestVenue({ ...venue, id: 1n }))).toThrow(
      IrisCoreErrors.UnexpectedVenue,
    );
  });

  describe("isHealthy", () => {
    test("should reserve the worst-case payoff against the lltv limit", () => {
      // Debt 1 plus the residual to the deadline, within the 2 * 0.8 limit.
      expect(accrualPosition.isHealthy).toBe(true);
      expect(
        new AccrualPosition({ ...position, debt: 2n * MathLib.WAD }, loan, venue).isHealthy,
      ).toBe(false);
    });

    test("should be undefined when the price is unknown", () => {
      expect(
        new AccrualPosition(position, loan, new TestVenue({ ...venue, price: undefined }))
          .isHealthy,
      ).toBeUndefined();
    });
  });

  describe("isHealthyBond", () => {
    test("should be unhealthy when the bond does not cover the requirement", () => {
      const value = new AccrualPosition(
        { ...position, bondRequirement: position.bond + 1n },
        loan,
        venue,
      );

      expect(accrualPosition.isHealthyBond).toBe(true);
      expect(value.isHealthyBond).toBe(false);
    });
  });

  describe("drawdown", () => {
    test("should relate the negative net to the bond", () => {
      expect(accrualPosition.drawdown).toBe(0n);

      // 0.05 floating over 0.1 bond.
      expect(
        new AccrualPosition({ ...position, floatingLeg: 50_000_000_000_000_000n }, loan, venue)
          .drawdown,
      ).toBe(500_000_000_000_000_000n);
    });
  });

  describe("withdrawableCollateral", () => {
    test("should reserve the worst-case payoff against the lltv limit", () => {
      // Past the deadline the residual is zero: required = 1 debt / 0.8 lltv = 1.25 collateral.
      const value = new AccrualPosition(
        { ...position, lastUpdate: loan.maturity + loan.overduePeriod },
        loan,
        venue,
      );

      expect(value.withdrawableCollateral).toBe(750_000_000_000_000_000n);
    });

    test("should be undefined when the price is unknown", () => {
      const value = new AccrualPosition(
        position,
        loan,
        new TestVenue({ ...venue, price: undefined }),
      );

      expect(value.withdrawableCollateral).toBeUndefined();
    });
  });

  describe("withdrawableBond", () => {
    test("should keep the bond requirement", () => {
      expect(accrualPosition.withdrawableBond).toBe(position.bond - position.bondRequirement);
    });

    test("should reserve the drawdown allowance", () => {
      // Required bond = 0.05 floating / 0.5 bondLltv = 0.1: the whole bond.
      const value = new AccrualPosition(
        { ...position, floatingLeg: 50_000_000_000_000_000n },
        loan,
        venue,
      );

      expect(value.withdrawableBond).toBe(0n);
    });
  });

  describe("seizableCollateral", () => {
    test("should be zero while the loan is not liquidatable", () => {
      expect(accrualPosition.seizableCollateral).toBe(0n);
    });

    test("should price the repaid amount with the liquidation incentive", () => {
      // Repaid 1 (zero stored legs) at a 1:1 price with the max lif reached: 1.15.
      const value = new AccrualPosition(
        { ...position, lastUpdate: loan.maturity + loan.overduePeriod + 900n },
        loan,
        venue,
      );

      expect(value.seizableCollateral).toBe(1_150_000_000_000_000_000n);
    });
  });

  describe("seizableBond", () => {
    test("should be zero while the bond is healthy", () => {
      expect(accrualPosition.seizableBond).toBe(0n);
    });

    test("should seize the bond times the bond lif", () => {
      // Drawdown 0.6 > bondLltv 0.5, bond lif capped at 0.05: 0.1 * 0.05.
      const value = new AccrualPosition(
        { ...position, floatingLeg: 60_000_000_000_000_000n },
        loan,
        venue,
      );

      expect(value.seizableBond).toBe(5_000_000_000_000_000n);
    });
  });

  describe("repayAmount", () => {
    test("should charge the debt and the full-term fixed leg before maturity", () => {
      // Accrued 0.025 + residual 0.025: the fixed interest of the whole remaining term.
      expect(
        accrualPosition.accrueLegs(position.lastUpdate + SECONDS_PER_YEAR / 4n).repayAmount,
      ).toBe(MathLib.WAD + 50_000_000_000_000_000n);
    });
  });

  test("should expose the loan status at lastUpdate", () => {
    expect(accrualPosition.isOverdue).toBe(false);
    expect(accrualPosition.isLiquidatable).toBe(false);
    expect(accrualPosition.liquidatableAt).toBe(loan.maturity + loan.overduePeriod + 1n);
    expect(accrualPosition.lif).toBe(0n);
    expect(accrualPosition.bondLif).toBe(50_000_000_000_000_000n);

    const overdue = new AccrualPosition(
      { ...position, lastUpdate: loan.maturity + loan.overduePeriod + 900n },
      loan,
      venue,
    );

    expect(overdue.isOverdue).toBe(true);
    expect(overdue.isLiquidatable).toBe(true);
    expect(overdue.lif).toBe(150_000_000_000_000_000n);
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

    test("should throw when the price is unknown", () => {
      expect(() =>
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
      ).toThrow(IrisCoreErrors.UnknownVenuePrice);
    });
  });

  describe("repay", () => {
    test("should settle the legs and resolve the loan", () => {
      const { position: value, repaid } = accrualPosition.repay();

      // Debt 1 plus the full-term fixed leg credited at settlement.
      expect(repaid).toBe(MathLib.WAD + 50_000_000_000_000_000n);
      expect(repaid).toBe(accrualPosition.repayAmount);
      expect(value.debt).toBe(0n);
      // No negative net: the bond is untouched.
      expect(value.bond).toBe(position.bond);
      expect(value.bondRequirement).toBe(0n);
      expect(value.fixedLeg).toBe(0n);
      expect(value.floatingLeg).toBe(0n);
      expect(value.surplus).toBe(0n);
      // The borrower keeps the collateral, on the position and on the venue.
      expect(value.collateral).toBe(position.collateral);
      expect(value.venue.collateral).toBe(venue.collateral);
      // The venue is repaid in full.
      expect(value.venue.debt).toBe(0n);
      // The original position is left unchanged.
      expect(accrualPosition.debt).toBe(position.debt);
    });

    test("should slash the bond by the negative net", () => {
      // Floating 0.06 over the 0.05 settled fixed leg: 0.01 slashed off the 0.1 bond.
      const { position: value, repaid } = new AccrualPosition(
        { ...position, floatingLeg: 60_000_000_000_000_000n },
        loan,
        venue,
      ).repay();

      expect(value.bond).toBe(90_000_000_000_000_000n);
      // The bond absorbs the negative net, so no bad bond is charged to the payer.
      expect(repaid).toBe(MathLib.WAD + 50_000_000_000_000_000n);
    });

    test("should throw when the price is unknown", () => {
      expect(() =>
        new AccrualPosition(position, loan, new TestVenue({ ...venue, price: undefined })).repay(),
      ).toThrow(IrisCoreErrors.UnknownVenuePrice);
    });
  });

  describe("liquidate", () => {
    const liquidatable = { ...position, lastUpdate: loan.maturity + loan.overduePeriod + 900n };

    test("should throw while the loan is not liquidatable", () => {
      expect(() => accrualPosition.liquidate()).toThrow(IrisCoreErrors.HealthyLoan);
    });

    test("should seize the priced repay amount and resolve the loan", () => {
      // Repaid 1 (zero legs past maturity) at a 1:1 price with the max lif reached: 1.15.
      const {
        position: value,
        repaid,
        seized,
      } = new AccrualPosition(liquidatable, loan, venue).liquidate();

      expect(repaid).toBe(MathLib.WAD);
      expect(seized).toBe(1_150_000_000_000_000_000n);
      expect(value.collateral).toBe(850_000_000_000_000_000n);
      expect(value.debt).toBe(0n);
      expect(value.bondRequirement).toBe(0n);
      // The venue is repaid in full and the seized collateral withdrawn from it.
      expect(value.venue.debt).toBe(0n);
      expect(value.venue.collateral).toBe(850_000_000_000_000_000n);
    });

    test("should throw when the price is unknown", () => {
      expect(() =>
        new AccrualPosition(
          liquidatable,
          loan,
          new TestVenue({ ...venue, price: undefined }),
        ).liquidate(),
      ).toThrow(IrisCoreErrors.UnknownVenuePrice);
    });
  });

  describe("refinance", () => {
    // A freshly fetched venue holds no assets for the pod until the migration.
    const target = new TestVenue({
      ...venue,
      id: 0n,
      data: "0xabcd",
      collateral: 0n,
      debt: 0n,
      collateralIndex: 2n * MathLib.WAD,
      debtIndex: 3n * MathLib.WAD,
    });

    test("should migrate the assets and re-anchor on the new venue", () => {
      const value = accrualPosition.refinance(target);

      // The tracked amounts are unchanged: only the index basis moves.
      expect(value.collateral).toBe(position.collateral);
      expect(value.debt).toBe(position.debt);
      expect(value.collateralIndex).toBe(2n * MathLib.WAD);
      expect(value.debtIndex).toBe(3n * MathLib.WAD);
      expect(value.venueId).toBe(target.id);
      expect(value.data).toBe(target.data);
      // The pod's assets moved onto the new venue.
      expect(value.venue.collateral).toBe(venue.collateral);
      expect(value.venue.debt).toBe(venue.debt);
    });

    test("should throw when the venue is not allowed by the loan", () => {
      expect(() => accrualPosition.refinance(new TestVenue({ ...target, id: 1n }))).toThrow(
        IrisCoreErrors.NotAllowedVenue,
      );
    });

    test("should throw once the loan is resolved", () => {
      expect(() =>
        new AccrualPosition({ ...position, bondRequirement: 0n }, loan, venue).refinance(target),
      ).toThrow(IrisCoreErrors.LoanResolved);
    });

    test("should throw when the price is unknown", () => {
      expect(() =>
        new AccrualPosition(
          position,
          loan,
          new TestVenue({ ...venue, price: undefined }),
        ).refinance(target),
      ).toThrow(IrisCoreErrors.UnknownVenuePrice);
    });
  });

  describe("supplyCollateral", () => {
    test("should add the collateral to the position and the venue", () => {
      const value = accrualPosition.supplyCollateral(MathLib.WAD);

      expect(value.collateral).toBe(3n * MathLib.WAD);
      expect(value.venue.collateral).toBe(3n * MathLib.WAD);
    });

    test("should throw when the price is unknown", () => {
      expect(() =>
        new AccrualPosition(
          position,
          loan,
          new TestVenue({ ...venue, price: undefined }),
        ).supplyCollateral(1n),
      ).toThrow(IrisCoreErrors.UnknownVenuePrice);
    });
  });

  describe("withdrawCollateral", () => {
    test("should withdraw up to the withdrawable limit", () => {
      // At the liquidation deadline the residual is zero: 1 debt / 0.8 lltv = 1.25 reserved.
      const deadline = loan.maturity + loan.overduePeriod;
      const value = new AccrualPosition({ ...position, lastUpdate: deadline }, loan, venue);

      expect(value.withdrawCollateral(750_000_000_000_000_000n).collateral).toBe(
        1_250_000_000_000_000_000n,
      );
      expect(() => value.withdrawCollateral(750_000_000_000_000_001n)).toThrow(
        IrisCoreErrors.InsufficientCollateral,
      );
    });

    test("should throw when the price is unknown", () => {
      expect(() =>
        new AccrualPosition(
          position,
          loan,
          new TestVenue({ ...venue, price: undefined }),
        ).withdrawCollateral(1n),
      ).toThrow(IrisCoreErrors.UnknownVenuePrice);
    });
  });

  describe("supplyBond", () => {
    test("should top up the bond in place", () => {
      const value = new AccrualPosition(position, loan, venue);

      expect(value.supplyBond(position.bond).bond).toBe(2n * position.bond);
      // The top-up is also applied in place.
      expect(value.bond).toBe(2n * position.bond);
    });
  });

  describe("withdrawBond", () => {
    test("should withdraw down to the required bond", () => {
      expect(accrualPosition.withdrawBond(position.bond - 1n).bond).toBe(1n);
      expect(() => accrualPosition.withdrawBond(position.bond)).toThrow(
        IrisCoreErrors.InsufficientBond,
      );
    });

    test("should keep the drawdown allowance", () => {
      // Any withdrawal pushes the 0.05 / 0.1 drawdown over the 0.5 bondLltv.
      const value = new AccrualPosition(
        { ...position, floatingLeg: 50_000_000_000_000_000n },
        loan,
        venue,
      );

      expect(() => value.withdrawBond(1n)).toThrow(IrisCoreErrors.InsufficientBond);
    });

    test("should throw when the price is unknown", () => {
      expect(() =>
        new AccrualPosition(
          position,
          loan,
          new TestVenue({ ...venue, price: undefined }),
        ).withdrawBond(1n),
      ).toThrow(IrisCoreErrors.UnknownVenuePrice);
    });
  });

  describe("liquidateBond", () => {
    test("should throw while the bond is healthy", () => {
      expect(() => accrualPosition.liquidateBond()).toThrow(IrisCoreErrors.HealthyBond);
    });

    test("should slash the negative net plus the seized incentive", () => {
      // Drawdown 0.6 > 0.5: seized = 0.1 * 0.05 and slashed = 0.06 + 0.005.
      const {
        position: value,
        seized,
        repaid,
      } = new AccrualPosition(
        { ...position, floatingLeg: 60_000_000_000_000_000n },
        loan,
        venue,
      ).liquidateBond();

      expect(seized).toBe(5_000_000_000_000_000n);
      expect(value.bond).toBe(35_000_000_000_000_000n);
      expect(value.collateral).toBe(0n);
      expect(value.debt).toBe(0n);
      expect(value.bondRequirement).toBe(0n);
      // The slashed bond beyond the seized cut repays the venue debt: 0.065 - 0.005.
      expect(repaid).toBe(60_000_000_000_000_000n);
      expect(value.venue.debt).toBe(MathLib.WAD - 60_000_000_000_000_000n);
      // Iris stops tracking the collateral without withdrawing it from the venue.
      expect(value.venue.collateral).toBe(venue.collateral);
    });

    test("should cap the repaid amount at the venue debt", () => {
      const { repaid, position: value } = new AccrualPosition(
        { ...position, floatingLeg: 60_000_000_000_000_000n },
        loan,
        new TestVenue({ ...venue, debt: 10_000_000_000_000_000n }),
      ).liquidateBond();

      expect(repaid).toBe(10_000_000_000_000_000n);
      expect(value.venue.debt).toBe(0n);
    });

    test("should throw when the price is unknown", () => {
      expect(() =>
        new AccrualPosition(
          position,
          loan,
          new TestVenue({ ...venue, price: undefined }),
        ).liquidateBond(),
      ).toThrow(IrisCoreErrors.UnknownVenuePrice);
    });
  });
});

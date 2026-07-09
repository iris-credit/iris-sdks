import { describe, expect, test } from "vitest";
import { SECONDS_PER_YEAR } from "../../constants.js";
import { IrisCoreErrors } from "../../errors.js";
import { MathLib } from "../../math/index.js";
import { PositionUtils } from "./PositionUtils.js";

describe("PositionUtils", () => {
  describe("getAccruedLegs", () => {
    const emptyPosition = {
      collateral: MathLib.WAD,
      debt: MathLib.WAD,
      bondRequirement: MathLib.WAD,
      collateralIndex: 1_500_000_000_000_000_000n,
      debtIndex: 1_200_000_000_000_000_000n,
      floatingLeg: 0n,
      surplus: 0n,
      lastUpdate: 0n,
    };
    const loan = {
      maturity: 40_000_000n,
      fixedRate: 100_000_000_000_000_000n,
      overdueRate: 200_000_000_000_000_000n,
    };

    test("should return stored indices and zero increments when never updated", () => {
      expect(
        PositionUtils.getAccruedLegs(
          emptyPosition,
          loan,
          2n * MathLib.WAD,
          2n * MathLib.WAD,
          1_000n,
        ),
      ).toEqual({
        collateralIndex: 1_500_000_000_000_000_000n,
        debtIndex: 1_200_000_000_000_000_000n,
        fixedLeg: 0n,
        floatingLeg: 0n,
        surplus: 0n,
      });
    });

    test("should return stored indices and zero increments when no time elapsed", () => {
      expect(
        PositionUtils.getAccruedLegs(
          { ...emptyPosition, lastUpdate: 1_000n },
          loan,
          2n * MathLib.WAD,
          2n * MathLib.WAD,
          1_000n,
        ),
      ).toEqual({
        collateralIndex: 1_500_000_000_000_000_000n,
        debtIndex: 1_200_000_000_000_000_000n,
        fixedLeg: 0n,
        floatingLeg: 0n,
        surplus: 0n,
      });
    });

    test("should accrue the fixed leg pro rata temporis", () => {
      // 10% over exactly one year: 0.1 * debt.
      expect(
        PositionUtils.getAccruedLegs(
          {
            collateral: 0n,
            debt: MathLib.WAD,
            bondRequirement: 0n,
            collateralIndex: MathLib.WAD,
            debtIndex: MathLib.WAD,
            floatingLeg: 0n,
            surplus: 0n,
            lastUpdate: 1_000n,
          },
          loan,
          MathLib.WAD,
          MathLib.WAD,
          1_000n + SECONDS_PER_YEAR,
        ),
      ).toEqual({
        collateralIndex: MathLib.WAD,
        debtIndex: MathLib.WAD,
        fixedLeg: 100_000_000_000_000_000n,
        floatingLeg: 0n,
        surplus: 0n,
      });
    });

    test("should accrue the floating leg on debt + floatingLeg with the index growth", () => {
      // (1 + 0.5) * (1.1 - 1) / 1 = 0.15 MathLib.WAD.
      expect(
        PositionUtils.getAccruedLegs(
          {
            collateral: 0n,
            debt: MathLib.WAD,
            bondRequirement: 0n,
            collateralIndex: MathLib.WAD,
            debtIndex: MathLib.WAD,
            floatingLeg: 500_000_000_000_000_000n,
            surplus: 0n,
            lastUpdate: 1_000n,
          },
          { maturity: 40_000_000n, fixedRate: 0n, overdueRate: 0n },
          MathLib.WAD,
          1_100_000_000_000_000_000n,
          2_000n,
        ).floatingLeg,
      ).toBe(150_000_000_000_000_000n);
    });

    test("should floor the floating leg increment", () => {
      // (2 + 1) * 1 / 1e18 floors to 0.
      expect(
        PositionUtils.getAccruedLegs(
          {
            collateral: 0n,
            debt: 2n,
            bondRequirement: 0n,
            collateralIndex: MathLib.WAD,
            debtIndex: MathLib.WAD,
            floatingLeg: 1n,
            surplus: 0n,
            lastUpdate: 1_000n,
          },
          { maturity: 40_000_000n, fixedRate: 0n, overdueRate: 0n },
          MathLib.WAD,
          MathLib.WAD + 1n,
          2_000n,
        ).floatingLeg,
      ).toBe(0n);
    });

    test("should accrue the surplus only while the loan is open", () => {
      const position = {
        collateral: 2n * MathLib.WAD,
        debt: 0n,
        bondRequirement: 1n,
        collateralIndex: MathLib.WAD,
        debtIndex: MathLib.WAD,
        floatingLeg: 0n,
        surplus: 0n,
        lastUpdate: 1_000n,
      };
      const newCollateralIndex = 1_050_000_000_000_000_000n;

      // (2 + 0) * (1.05 - 1) / 1 = 0.1 MathLib.WAD.
      expect(
        PositionUtils.getAccruedLegs(
          position,
          { maturity: 40_000_000n, fixedRate: 0n, overdueRate: 0n },
          newCollateralIndex,
          MathLib.WAD,
          2_000n,
        ).surplus,
      ).toBe(100_000_000_000_000_000n);

      // bondRequirement == 0 gates the surplus accrual entirely.
      expect(
        PositionUtils.getAccruedLegs(
          { ...position, bondRequirement: 0n },
          { maturity: 40_000_000n, fixedRate: 0n, overdueRate: 0n },
          newCollateralIndex,
          MathLib.WAD,
          2_000n,
        ).surplus,
      ).toBe(0n);
    });

    test("should add the overdue rate for the elapsed time past maturity", () => {
      // A debt of SECONDS_PER_YEAR MathLib.WAD makes each accrued second worth the rate:
      // base: 150s * 0.1e18 = 1.5e19; overdue: 50s past maturity * 0.2e18 = 1e19.
      expect(
        PositionUtils.getAccruedLegs(
          {
            collateral: 0n,
            debt: SECONDS_PER_YEAR * MathLib.WAD,
            bondRequirement: 0n,
            collateralIndex: MathLib.WAD,
            debtIndex: MathLib.WAD,
            floatingLeg: 0n,
            surplus: 0n,
            lastUpdate: 999_900n,
          },
          { ...loan, maturity: 1_000_000n },
          MathLib.WAD,
          MathLib.WAD,
          1_000_050n,
        ).fixedLeg,
      ).toBe(25_000_000_000_000_000_000n);
    });

    test("should start the overdue accrual at lastUpdate when already past maturity", () => {
      // Both rates cover the same 50s window: 50 * (0.1e18 + 0.2e18) = 1.5e19.
      expect(
        PositionUtils.getAccruedLegs(
          {
            collateral: 0n,
            debt: SECONDS_PER_YEAR * MathLib.WAD,
            bondRequirement: 0n,
            collateralIndex: MathLib.WAD,
            debtIndex: MathLib.WAD,
            floatingLeg: 0n,
            surplus: 0n,
            lastUpdate: 1_000_100n,
          },
          { ...loan, maturity: 1_000_000n },
          MathLib.WAD,
          MathLib.WAD,
          1_000_150n,
        ).fixedLeg,
      ).toBe(15_000_000_000_000_000_000n);
    });

    test("should throw when the timestamp is prior to the last update", () => {
      expect(() =>
        PositionUtils.getAccruedLegs(
          { ...emptyPosition, lastUpdate: 2_000n },
          loan,
          2n * MathLib.WAD,
          2n * MathLib.WAD,
          1_000n,
        ),
      ).toThrow(IrisCoreErrors.InvalidInterestAccrual);
    });

    test("should throw when a venue index is prior to the stored index", () => {
      // Stored indices are 1.5 / 1.2 WAD.
      const position = { ...emptyPosition, lastUpdate: 1_000n };

      expect(() =>
        PositionUtils.getAccruedLegs(position, loan, MathLib.WAD, 2n * MathLib.WAD, 2_000n),
      ).toThrow(IrisCoreErrors.InvalidVenueIndex);
      expect(() =>
        PositionUtils.getAccruedLegs(position, loan, 2n * MathLib.WAD, MathLib.WAD, 2_000n),
      ).toThrow(IrisCoreErrors.InvalidVenueIndex);
    });
  });

  describe("getResidual", () => {
    test("should credit the fixed interest remaining until maturity", () => {
      // 10% over half a year: 0.05 * debt.
      expect(
        PositionUtils.getResidual(
          { debt: MathLib.WAD },
          { maturity: 2_000_000n + SECONDS_PER_YEAR / 2n, fixedRate: 100_000_000_000_000_000n },
          2_000_000n,
        ),
      ).toBe(50_000_000_000_000_000n);
    });

    test("should return zero at or after maturity", () => {
      const loan = { maturity: 2_000_000n, fixedRate: 100_000_000_000_000_000n };

      expect(PositionUtils.getResidual({ debt: MathLib.WAD }, loan, 2_000_000n)).toBe(0n);
      expect(PositionUtils.getResidual({ debt: MathLib.WAD }, loan, 3_000_000n)).toBe(0n);
    });

    test("should floor the residual", () => {
      // 1 * (SECONDS_PER_YEAR/2 * 1e18) / (SECONDS_PER_YEAR * 1e18) = 0.5 floors to 0; a debt of 2 yields 1.
      const loan = { maturity: SECONDS_PER_YEAR / 2n, fixedRate: MathLib.WAD };

      expect(PositionUtils.getResidual({ debt: 1n }, loan, 0n)).toBe(0n);
      expect(PositionUtils.getResidual({ debt: 2n }, loan, 0n)).toBe(1n);
    });
  });

  describe("isHealthyBond", () => {
    test("should be healthy when the loan is closed", () => {
      expect(
        PositionUtils.isHealthyBond(
          { bond: 0n, bondRequirement: 0n, fixedLeg: 0n, floatingLeg: MathLib.WAD },
          { bondLltv: 0n },
        ),
      ).toBe(true);
    });

    test("should be unhealthy when the bond does not cover the requirement", () => {
      expect(
        PositionUtils.isHealthyBond(
          { bond: 99n, bondRequirement: 100n, fixedLeg: 0n, floatingLeg: 0n },
          { bondLltv: MathLib.WAD },
        ),
      ).toBe(false);
    });

    test("should be healthy when the net is not negative", () => {
      expect(
        PositionUtils.isHealthyBond(
          { bond: 100n, bondRequirement: 1n, fixedLeg: 5n, floatingLeg: 5n },
          { bondLltv: 0n },
        ),
      ).toBe(true);
    });

    test("should compare the drawdown to bondLltv inclusively", () => {
      const position = { bond: 1_000n, bondRequirement: 1n, fixedLeg: 0n, floatingLeg: 500n };

      // drawdown = 500 * 1e18 / 1_000 = 0.5 MathLib.WAD == bondLltv.
      expect(PositionUtils.isHealthyBond(position, { bondLltv: 500_000_000_000_000_000n })).toBe(
        true,
      );
      expect(
        PositionUtils.isHealthyBond(
          { ...position, floatingLeg: 501n },
          { bondLltv: 500_000_000_000_000_000n },
        ),
      ).toBe(false);
    });

    test("should round the drawdown up", () => {
      // 3 * 1e18 / 9e18 = 0.33… rounds up to 1, exceeding a zero lltv (down would pass).
      expect(
        PositionUtils.isHealthyBond(
          { bond: 9n * MathLib.WAD, bondRequirement: 1n, fixedLeg: 0n, floatingLeg: 3n },
          { bondLltv: 0n },
        ),
      ).toBe(false);
    });
  });
});

import { describe, expect, test } from "vitest";
import { ORACLE_PRICE_SCALE, SECONDS_PER_YEAR } from "../../constants.js";
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
          { collateralIndex: 2n * MathLib.WAD, debtIndex: 2n * MathLib.WAD },
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
          { collateralIndex: 2n * MathLib.WAD, debtIndex: 2n * MathLib.WAD },
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
          { collateralIndex: MathLib.WAD, debtIndex: MathLib.WAD },
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
          { collateralIndex: MathLib.WAD, debtIndex: 1_100_000_000_000_000_000n },
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
          { collateralIndex: MathLib.WAD, debtIndex: MathLib.WAD + 1n },
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
          { collateralIndex: newCollateralIndex, debtIndex: MathLib.WAD },
          2_000n,
        ).surplus,
      ).toBe(100_000_000_000_000_000n);

      // bondRequirement == 0 gates the surplus accrual entirely.
      expect(
        PositionUtils.getAccruedLegs(
          { ...position, bondRequirement: 0n },
          { maturity: 40_000_000n, fixedRate: 0n, overdueRate: 0n },
          { collateralIndex: newCollateralIndex, debtIndex: MathLib.WAD },
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
          { collateralIndex: MathLib.WAD, debtIndex: MathLib.WAD },
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
          { collateralIndex: MathLib.WAD, debtIndex: MathLib.WAD },
          1_000_150n,
        ).fixedLeg,
      ).toBe(15_000_000_000_000_000_000n);
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

  describe("getSettlement", () => {
    const loan = {
      maturity: 2_000_000n + SECONDS_PER_YEAR / 2n,
      fixedRate: 100_000_000_000_000_000n,
      fee: 200_000_000_000_000_000n,
    };

    test("should include the residual in the net when settling before maturity", () => {
      // 10% over half a year: 0.05 * debt on top of the stored fixed leg.
      expect(
        PositionUtils.getSettlement(
          { debt: MathLib.WAD, fixedLeg: 10_000_000_000_000_000n, floatingLeg: 0n, surplus: 0n },
          { ...loan, fee: 0n },
          2_000_000n,
        ).net,
      ).toBe(60_000_000_000_000_000n);
    });

    test("should include no residual at or after maturity", () => {
      const position = { debt: MathLib.WAD, fixedLeg: 30n, floatingLeg: 0n, surplus: 0n };

      expect(PositionUtils.getSettlement(position, loan, loan.maturity).net).toBe(30n);
      expect(PositionUtils.getSettlement(position, loan, loan.maturity + 1_000n).net).toBe(30n);
    });

    test("should take the fee cuts on the net and the surplus", () => {
      // net = 50 - 20 = 30 with a 20% fee: a 6 cut; surplus 100: a 20 cut.
      expect(
        PositionUtils.getSettlement(
          { debt: 0n, fixedLeg: 50n, floatingLeg: 20n, surplus: 100n },
          loan,
          loan.maturity,
        ),
      ).toEqual({ net: 30n, performanceFee: 6n, surplusFee: 20n });
    });

    test("should take the surplus fee even when the floating leg covers the fixed leg", () => {
      expect(
        PositionUtils.getSettlement(
          { debt: 0n, fixedLeg: 20n, floatingLeg: 50n, surplus: 100n },
          loan,
          loan.maturity,
        ),
      ).toEqual({ net: 0n, performanceFee: 0n, surplusFee: 20n });
    });

    test("should take no cut when the fee is zero", () => {
      expect(
        PositionUtils.getSettlement(
          { debt: 0n, fixedLeg: 50n, floatingLeg: 20n, surplus: 100n },
          { ...loan, fee: 0n },
          loan.maturity,
        ),
      ).toEqual({ net: 30n, performanceFee: 0n, surplusFee: 0n });
    });

    test("should floor the fee cuts", () => {
      // 3 * 0.4e18 / 1e18 = 1.2 floors to 1 for both cuts.
      expect(
        PositionUtils.getSettlement(
          { debt: 0n, fixedLeg: 3n, floatingLeg: 0n, surplus: 3n },
          { ...loan, fee: 400_000_000_000_000_000n },
          loan.maturity,
        ),
      ).toEqual({ net: 3n, performanceFee: 1n, surplusFee: 1n });
    });
  });

  describe("getRepayAmount", () => {
    test("should repay the debt plus the fixed leg", () => {
      expect(
        PositionUtils.getRepayAmount({
          debt: MathLib.WAD,
          fixedLeg: 100_000_000_000_000_000n,
          bond: 0n,
          floatingLeg: 0n,
        }),
      ).toBe(1_100_000_000_000_000_000n);
    });

    test("should charge the bad bond to the repayer", () => {
      const position = { debt: MathLib.WAD, fixedLeg: 0n, bond: 100n, floatingLeg: 400n };

      // negativeNet = 400 with a 100 bond: 300 of bad bond added to the repaid debt.
      expect(PositionUtils.getRepayAmount(position)).toBe(MathLib.WAD + 300n);
      // A 400 bond absorbs the whole negative net.
      expect(PositionUtils.getRepayAmount({ ...position, bond: 400n })).toBe(MathLib.WAD);
    });
  });

  describe("getLiquidationSeizedCollateral", () => {
    // Liquidatable past maturity + overduePeriod = 1_086_400.
    const loan = { maturity: 1_000_000n, overduePeriod: 86_400n };
    const venue = { price: ORACLE_PRICE_SCALE };
    const position = {
      collateral: 10n * MathLib.WAD,
      debt: MathLib.WAD,
      bond: 0n,
      fixedLeg: 0n,
      floatingLeg: 0n,
    };

    test("should seize the repaid amount with the incentive applied", () => {
      // repaid = 1.1 * debt; lif maxed at 0.15 past TIME_TO_MAX_LIF: seized = 1.1 * 1.15.
      expect(
        PositionUtils.getLiquidationSeizedCollateral(
          { ...position, fixedLeg: 100_000_000_000_000_000n },
          loan,
          venue,
          1_087_300n,
        ),
      ).toBe(1_265_000_000_000_000_000n);
    });

    test("should ramp the liquidation incentive linearly to MAX_LIF", () => {
      // 450s past liquidatable over the 900s ramp: lif = 0.075; capped at 0.15 beyond.
      expect(PositionUtils.getLiquidationSeizedCollateral(position, loan, venue, 1_086_850n)).toBe(
        1_075_000_000_000_000_000n,
      );
      expect(PositionUtils.getLiquidationSeizedCollateral(position, loan, venue, 1_096_400n)).toBe(
        1_150_000_000_000_000_000n,
      );
    });

    test("should convert the seized collateral with the collateral price", () => {
      // lif maxed at 0.15; each collateral asset is worth 2 debt assets: seized = 1.15 / 2.
      expect(
        PositionUtils.getLiquidationSeizedCollateral(
          position,
          loan,
          { price: 2n * ORACLE_PRICE_SCALE },
          1_087_300n,
        ),
      ).toBe(575_000_000_000_000_000n);
    });

    test("should seize nothing while the loan is not liquidatable", () => {
      // Liquidatable strictly past maturity + overduePeriod; one second past ramps the lif.
      expect(PositionUtils.getLiquidationSeizedCollateral(position, loan, venue, 1_086_400n)).toBe(
        0n,
      );
      expect(PositionUtils.getLiquidationSeizedCollateral(position, loan, venue, 1_086_401n)).toBe(
        1_000_166_666_666_666_666n,
      );
    });

    test("should seize nothing when the price is zero", () => {
      expect(
        PositionUtils.getLiquidationSeizedCollateral(position, loan, { price: 0n }, 1_087_300n),
      ).toBe(0n);
    });

    test("should cap the seized collateral at the position's collateral", () => {
      expect(
        PositionUtils.getLiquidationSeizedCollateral(
          { ...position, collateral: 1_000n },
          loan,
          venue,
          1_087_300n,
        ),
      ).toBe(1_000n);
    });

    test("should return undefined when the price is unknown", () => {
      expect(
        PositionUtils.getLiquidationSeizedCollateral(position, loan, {}, 1_087_300n),
      ).toBeUndefined();
    });
  });

  describe("getBondLiquidationSeizedAmount", () => {
    // bondLltv 0.95: bondLif = 1 / (1 - 0.5 * 0.05) - 1 ≈ 0.025641.
    const loan = { bondLltv: 950_000_000_000_000_000n };
    const position = {
      bond: MathLib.WAD,
      bondRequirement: 1n,
      fixedLeg: 0n,
      floatingLeg: 960_000_000_000_000_000n,
    };

    test("should seize the bond times the bond liquidation incentive", () => {
      expect(PositionUtils.getBondLiquidationSeizedAmount(position, loan)).toBe(
        25_641_025_641_025_641n,
      );
    });

    test("should seize nothing while the bond is healthy", () => {
      // drawdown = 0.95 == bondLltv keeps the bond healthy (inclusive).
      expect(
        PositionUtils.getBondLiquidationSeizedAmount(
          { ...position, floatingLeg: 950_000_000_000_000_000n },
          loan,
        ),
      ).toBe(0n);
      // A closed loan (zero bond requirement) is always healthy.
      expect(
        PositionUtils.getBondLiquidationSeizedAmount({ ...position, bondRequirement: 0n }, loan),
      ).toBe(0n);
    });

    test("should cap the incentive at MAX_BOND_LIF", () => {
      // bondLltv 0: raw lif = 1 / (1 - 0.5) - 1 = 1, capped at 0.05.
      expect(
        PositionUtils.getBondLiquidationSeizedAmount(
          { bond: MathLib.WAD, bondRequirement: 1n, fixedLeg: 0n, floatingLeg: 1n },
          { bondLltv: 0n },
        ),
      ).toBe(50_000_000_000_000_000n);
    });

    test("should floor the seized bond", () => {
      // 1_000 * 0.025641… floors to 25.
      expect(
        PositionUtils.getBondLiquidationSeizedAmount(
          { ...position, bond: 1_000n, floatingLeg: 960n },
          loan,
        ),
      ).toBe(25n);
    });
  });

  describe("getCollateralValue", () => {
    test("should quote the collateral in debt assets", () => {
      expect(
        PositionUtils.getCollateralValue(
          { collateral: 2n * MathLib.WAD },
          { price: 3n * ORACLE_PRICE_SCALE },
        ),
      ).toBe(6n * MathLib.WAD);
    });

    test("should floor the value", () => {
      // 3 * 0.5 floors to 1.
      expect(
        PositionUtils.getCollateralValue({ collateral: 3n }, { price: ORACLE_PRICE_SCALE / 2n }),
      ).toBe(1n);
    });

    test("should return zero on a zero price", () => {
      expect(PositionUtils.getCollateralValue({ collateral: MathLib.WAD }, { price: 0n })).toBe(0n);
    });

    test("should return undefined when the price is unknown", () => {
      expect(PositionUtils.getCollateralValue({ collateral: MathLib.WAD }, {})).toBeUndefined();
    });
  });

  describe("getRebasedPosition", () => {
    const position = {
      collateral: 10n * MathLib.WAD,
      debt: 5n * MathLib.WAD,
      bondRequirement: 1n,
      floatingLeg: 0n,
      surplus: 0n,
    };

    test("should return the position unchanged when the venue saw no liquidation or repayment", () => {
      // Venue assets match the tracked state: nothing to rebase (no price needed).
      expect(
        PositionUtils.getRebasedPosition(position, {
          collateral: 10n * MathLib.WAD,
          debt: 5n * MathLib.WAD,
        }),
      ).toEqual(position);
      // One-sided drift does not rebase either.
      expect(
        PositionUtils.getRebasedPosition(position, {
          collateral: 8n * MathLib.WAD,
          debt: 5n * MathLib.WAD,
        }),
      ).toEqual(position);
    });

    test("should track an external liquidation seizing collateral and repaying debt", () => {
      expect(
        PositionUtils.getRebasedPosition(position, {
          collateral: 4n * MathLib.WAD,
          debt: 2n * MathLib.WAD,
          price: ORACLE_PRICE_SCALE,
        }),
      ).toEqual({
        collateral: 4n * MathLib.WAD,
        debt: 2n * MathLib.WAD,
        bondRequirement: 1n,
        floatingLeg: 0n,
        surplus: 0n,
      });
    });

    test("should cap the repaid debt at the liquidated amount's value", () => {
      // liquidated = 1 and repaid = 6, capped at 1 * price: the debt only drops by 1.
      expect(
        PositionUtils.getRebasedPosition(
          { ...position, debt: 8n * MathLib.WAD },
          { collateral: 9n * MathLib.WAD, debt: 2n * MathLib.WAD, price: ORACLE_PRICE_SCALE },
        ),
      ).toEqual({
        collateral: 9n * MathLib.WAD,
        debt: 7n * MathLib.WAD,
        bondRequirement: 1n,
        floatingLeg: 0n,
        surplus: 0n,
      });
    });

    test("should resolve the loan on bad debt", () => {
      // badDebt = 2 - 1: the bond requirement is zeroed.
      expect(
        PositionUtils.getRebasedPosition(position, {
          collateral: MathLib.WAD,
          debt: 2n * MathLib.WAD,
          price: ORACLE_PRICE_SCALE,
        }),
      ).toEqual({
        collateral: MathLib.WAD,
        debt: 2n * MathLib.WAD,
        bondRequirement: 0n,
        floatingLeg: 0n,
        surplus: 0n,
      });
    });

    test("should resolve the loan and clamp the legs when the venue is emptied", () => {
      expect(
        PositionUtils.getRebasedPosition(
          { collateral: 3n, debt: 4n, bondRequirement: 5n, floatingLeg: 1n, surplus: 2n },
          { collateral: 0n, debt: 0n, price: ORACLE_PRICE_SCALE },
        ),
      ).toEqual({ collateral: 0n, debt: 0n, bondRequirement: 0n, floatingLeg: 0n, surplus: 0n });
    });

    test("should clamp the floating leg and surplus to the venue's actuals", () => {
      // badDebt = 3 - 2 also resolves the loan.
      expect(
        PositionUtils.getRebasedPosition(
          { collateral: 0n, debt: 0n, bondRequirement: 1n, floatingLeg: 5n, surplus: 5n },
          { collateral: 2n, debt: 3n, price: ORACLE_PRICE_SCALE },
        ),
      ).toEqual({ collateral: 0n, debt: 0n, bondRequirement: 0n, floatingLeg: 3n, surplus: 2n });
    });

    test("should return undefined when a rebase is needed but the price is unknown", () => {
      expect(
        PositionUtils.getRebasedPosition(position, {
          collateral: 4n * MathLib.WAD,
          debt: 2n * MathLib.WAD,
        }),
      ).toBeUndefined();
    });
  });

  describe("getRequiredCollateralValue", () => {
    const loan = {
      maturity: 40_000_000n,
      overduePeriod: 86_400n,
      fixedRate: 100_000_000_000_000_000n,
      overdueRate: 0n,
    };

    test("should charge the debt, the fixed leg and the residual to the deadline", () => {
      // A year out: 1 debt + 0.025 fixed leg + 0.1 residual.
      expect(
        PositionUtils.getRequiredCollateralValue(
          { debt: MathLib.WAD, fixedLeg: 25_000_000_000_000_000n },
          loan,
          40_086_400n - SECONDS_PER_YEAR,
        ),
      ).toBe(1_125_000_000_000_000_000n);
    });

    test("should reserve no residual past the deadline", () => {
      expect(
        PositionUtils.getRequiredCollateralValue(
          { debt: MathLib.WAD, fixedLeg: 25_000_000_000_000_000n },
          loan,
          40_086_401n,
        ),
      ).toBe(1_025_000_000_000_000_000n);
    });
  });

  describe("getWithdrawableCollateral", () => {
    const loan = {
      maturity: 32_536_000n,
      overduePeriod: 86_400n,
      fixedRate: 100_000_000_000_000_000n,
      overdueRate: 200_000_000_000_000_000n,
    };
    const pair = { price: ORACLE_PRICE_SCALE, lltv: MathLib.WAD };
    /** The venue as it stands under the position: no surplus, no floating leg. */
    const venueUnder = (position: { collateral: bigint; debt: bigint }) => ({
      ...pair,
      collateral: position.collateral,
      debt: position.debt,
    });

    test("should reserve the worst-case interest until the liquidation deadline", () => {
      // One year to maturity: residual = 365 * (0.1 * (1y + 1d) + 0.2 * 1d) / 1y = 36.8.
      const position = { collateral: 500n * MathLib.WAD, debt: 365n * MathLib.WAD, fixedLeg: 0n };

      expect(
        PositionUtils.getWithdrawableCollateral(position, loan, venueUnder(position), 1_000_000n),
      ).toBe(98_200_000_000_000_000_000n);
    });

    test("should not reserve any interest at or past the liquidation deadline", () => {
      // Past the deadline the payoff is just debt + fixedLeg.
      const position = {
        collateral: 5n * MathLib.WAD,
        debt: 2n * MathLib.WAD,
        fixedLeg: MathLib.WAD,
      };

      expect(
        PositionUtils.getWithdrawableCollateral(position, loan, venueUnder(position), 32_622_400n),
      ).toBe(2n * MathLib.WAD);
    });

    test("should require more collateral the lower the LLTV", () => {
      // A payoff of 2 at a 50% LLTV reserves 4.
      const position = { collateral: 5n * MathLib.WAD, debt: 2n * MathLib.WAD, fixedLeg: 0n };

      expect(
        PositionUtils.getWithdrawableCollateral(
          position,
          loan,
          { ...venueUnder(position), lltv: 500_000_000_000_000_000n },
          32_622_400n,
        ),
      ).toBe(MathLib.WAD);
    });

    test("should round the required collateral up", () => {
      // ceil(ceil(3 / 0.4) * OPS / (3 * OPS)) = ceil(8 / 3) = 3: 5 - 3 = 2.
      const position = { collateral: 5n, debt: 3n, fixedLeg: 0n };

      expect(
        PositionUtils.getWithdrawableCollateral(
          position,
          loan,
          {
            ...venueUnder(position),
            price: 3n * ORACLE_PRICE_SCALE,
            lltv: 400_000_000_000_000_000n,
          },
          32_622_400n,
        ),
      ).toBe(2n);
    });

    test("should bound by the venue's own limit when the floating leg outgrows the payoff", () => {
      // Past the deadline Iris reserves the 2 debt, freeing 3 of the 5; the venue owes 4, freeing 1.
      const position = { collateral: 5n * MathLib.WAD, debt: 2n * MathLib.WAD, fixedLeg: 0n };

      expect(
        PositionUtils.getWithdrawableCollateral(
          position,
          loan,
          { ...venueUnder(position), debt: 4n * MathLib.WAD },
          32_622_400n,
        ),
      ).toBe(MathLib.WAD);
    });

    test("should return zero when the collateral cannot cover the worst-case payoff", () => {
      const position = { collateral: MathLib.WAD, debt: 2n * MathLib.WAD, fixedLeg: 0n };

      expect(
        PositionUtils.getWithdrawableCollateral(position, loan, venueUnder(position), 32_622_400n),
      ).toBe(0n);
    });

    test("should return zero when the venue position is already unhealthy", () => {
      const position = { collateral: 5n * MathLib.WAD, debt: 2n * MathLib.WAD, fixedLeg: 0n };

      expect(
        PositionUtils.getWithdrawableCollateral(
          position,
          loan,
          { ...venueUnder(position), debt: 6n * MathLib.WAD },
          32_622_400n,
        ),
      ).toBe(0n);
    });

    test("should return the full collateral on a zero payoff", () => {
      // Nothing owed: the check passes for any amount.
      const position = { collateral: 7n, debt: 0n, fixedLeg: 0n };

      expect(
        PositionUtils.getWithdrawableCollateral(position, loan, venueUnder(position), 1_000_000n),
      ).toBe(7n);
    });

    test("should return zero on a zero price or LLTV", () => {
      const position = { collateral: MathLib.WAD, debt: MathLib.WAD, fixedLeg: 0n };

      expect(
        PositionUtils.getWithdrawableCollateral(
          position,
          loan,
          { ...venueUnder(position), price: 0n },
          1_000_000n,
        ),
      ).toBe(0n);
      expect(
        PositionUtils.getWithdrawableCollateral(
          position,
          loan,
          { ...venueUnder(position), lltv: 0n },
          1_000_000n,
        ),
      ).toBe(0n);
    });

    test("should return undefined when the price is unknown", () => {
      const position = { collateral: MathLib.WAD, debt: MathLib.WAD, fixedLeg: 0n };

      expect(
        PositionUtils.getWithdrawableCollateral(
          position,
          loan,
          { ...venueUnder(position), price: undefined },
          1_000_000n,
        ),
      ).toBeUndefined();
    });
  });

  describe("getDrawdown", () => {
    test("should return the negative net relative to the bond", () => {
      expect(
        PositionUtils.getDrawdown({
          bond: 1_000n,
          bondRequirement: 1n,
          fixedLeg: 0n,
          floatingLeg: 500n,
        }),
      ).toBe(500_000_000_000_000_000n);
    });

    test("should round the drawdown up", () => {
      // 3 * 1e18 / 9e18 rounds up to 1.
      expect(
        PositionUtils.getDrawdown({
          bond: 9n * MathLib.WAD,
          bondRequirement: 1n,
          fixedLeg: 0n,
          floatingLeg: 3n,
        }),
      ).toBe(1n);
    });

    test("should return zero when the net is not negative", () => {
      expect(
        PositionUtils.getDrawdown({ bond: 0n, bondRequirement: 1n, fixedLeg: 5n, floatingLeg: 5n }),
      ).toBe(0n);
    });

    test("should return zero once the loan is closed", () => {
      // A bad-debt rebase can resolve the loan with skewed legs left over.
      expect(
        PositionUtils.getDrawdown({
          bond: 1_000n,
          bondRequirement: 0n,
          fixedLeg: 0n,
          floatingLeg: 500n,
        }),
      ).toBe(0n);
    });

    test("should return MAX_UINT_256 on a zero bond with a negative net", () => {
      expect(
        PositionUtils.getDrawdown({ bond: 0n, bondRequirement: 1n, fixedLeg: 0n, floatingLeg: 1n }),
      ).toBe(MathLib.MAX_UINT_256);
    });
  });

  describe("getWithdrawableBond", () => {
    const loan = { bondLltv: 500_000_000_000_000_000n };

    test("should keep the bond covering the drawdown", () => {
      // A negative net of 400 at a 50% bond LLTV requires an 800 bond: 200 withdrawable.
      expect(
        PositionUtils.getWithdrawableBond(
          { bond: 1_000n, bondRequirement: 300n, fixedLeg: 0n, floatingLeg: 400n },
          loan,
        ),
      ).toBe(200n);
    });

    test("should keep the bond covering the requirement", () => {
      // A negative net of 100 only requires 200: the 300 requirement binds.
      expect(
        PositionUtils.getWithdrawableBond(
          { bond: 1_000n, bondRequirement: 300n, fixedLeg: 0n, floatingLeg: 100n },
          loan,
        ),
      ).toBe(700n);
    });

    test("should return the full bond once the loan is closed", () => {
      expect(
        PositionUtils.getWithdrawableBond(
          { bond: 1_000n, bondRequirement: 0n, fixedLeg: 0n, floatingLeg: MathLib.WAD },
          loan,
        ),
      ).toBe(1_000n);
    });

    test("should return zero when the bond is already unhealthy", () => {
      expect(
        PositionUtils.getWithdrawableBond(
          { bond: 250n, bondRequirement: 300n, fixedLeg: 0n, floatingLeg: 0n },
          loan,
        ),
      ).toBe(0n);
    });

    test("should return zero on a zero bond LLTV", () => {
      expect(
        PositionUtils.getWithdrawableBond(
          { bond: 1_000n, bondRequirement: 300n, fixedLeg: 0n, floatingLeg: 1n },
          { bondLltv: 0n },
        ),
      ).toBe(0n);
      // The zero-LLTV guard precedes the closed-loan one.
      expect(
        PositionUtils.getWithdrawableBond(
          { bond: 1_000n, bondRequirement: 0n, fixedLeg: 0n, floatingLeg: 0n },
          { bondLltv: 0n },
        ),
      ).toBe(0n);
    });
  });

  describe("isHealthy", () => {
    const loan = {
      maturity: 40_000_000n,
      overduePeriod: 86_400n,
      fixedRate: 100_000_000_000_000_000n,
      overdueRate: 0n,
    };
    const venue = { price: ORACLE_PRICE_SCALE, lltv: 800_000_000_000_000_000n };

    test("should compare the worst-case payoff to the lltv limit of the collateral value", () => {
      const position = {
        collateral: 2n * MathLib.WAD,
        debt: 1_600_000_000_000_000_000n,
        fixedLeg: 0n,
      };

      // At the liquidation deadline the residual is zero: maxDebt = 2 * 0.8 = 1.6.
      expect(PositionUtils.isHealthy(position, loan, venue, 40_086_400n)).toBe(true);
      expect(
        PositionUtils.isHealthy(
          { ...position, debt: 1_600_000_000_000_000_001n },
          loan,
          venue,
          40_086_400n,
        ),
      ).toBe(false);
    });

    test("should reserve the residual interest until the deadline", () => {
      // A year out, the 10% fixed rate reserves 0.16 on top of the 1.6 debt.
      expect(
        PositionUtils.isHealthy(
          { collateral: 2n * MathLib.WAD, debt: 1_600_000_000_000_000_000n, fixedLeg: 0n },
          loan,
          venue,
          40_086_400n - SECONDS_PER_YEAR,
        ),
      ).toBe(false);
    });

    test("should be undefined when the price is unknown", () => {
      expect(
        PositionUtils.isHealthy(
          { collateral: MathLib.WAD, debt: 0n, fixedLeg: 0n },
          loan,
          { lltv: MathLib.WAD },
          0n,
        ),
      ).toBeUndefined();
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

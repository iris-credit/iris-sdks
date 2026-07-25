import { describe, expect, test } from "vitest";
import { ORACLE_PRICE_SCALE, SECONDS_PER_YEAR } from "../../../constants.js";
import { IrisCoreErrors } from "../../../errors.js";
import { MathLib } from "../../../math/index.js";
import { AaveV3Venue } from "./AaveV3Venue.js";

describe("AaveV3Venue", () => {
  // Live view placeholders — these tests exercise the accrual model only.
  const view = {
    id: 1n,
    data: "0x" as const,
    pod: "0x0000000000000000000000000000000000000001" as const,
    collateral: 0n,
    debt: 0n,
    collateralIndex: MathLib.RAY,
    debtIndex: MathLib.RAY,
    lltv: 0n,
    lastUpdate: 1_000n,
  };

  const venue = new AaveV3Venue(
    view,
    { index: MathLib.RAY, rate: MathLib.RAY / 10n, lastUpdateTimestamp: 1_000n },
    { index: MathLib.RAY, rate: MathLib.RAY / 5n, lastUpdateTimestamp: 1_000n },
  );

  test("should keep the stored indices at the reserves' last update", () => {
    const accrued = venue.accrueInterest(1_000n);

    expect(accrued.collateralIndex).toBe(MathLib.RAY);
    expect(accrued.debtIndex).toBe(MathLib.RAY);
  });

  test("should accrue the collateral index linearly", () => {
    // 10% over exactly one year on a RAY index.
    expect(venue.accrueInterest(1_000n + SECONDS_PER_YEAR).collateralIndex).toBe(
      MathLib.RAY + MathLib.RAY / 10n,
    );
  });

  test("should accrue the debt index with compounding", () => {
    // Compounded 20% over a year: above the linear 1.2 RAY.
    expect(venue.accrueInterest(1_000n + SECONDS_PER_YEAR).debtIndex).toBeGreaterThan(
      MathLib.RAY + MathLib.RAY / 5n,
    );
  });

  test("should grow the pod's assets with their index", () => {
    const funded = new AaveV3Venue(
      { ...view, collateral: MathLib.WAD, debt: MathLib.WAD },
      venue.collateralReserve,
      venue.debtReserve,
    );
    const accrued = funded.accrueInterest(1_000n + SECONDS_PER_YEAR);

    // Collateral grows linearly with the liquidity index: 1.1x.
    expect(accrued.collateral).toBe(1_100_000_000_000_000_000n);
    // Debt compounds past the linear 1.2x.
    expect(accrued.debt).toBeGreaterThan(1_200_000_000_000_000_000n);
    // The original view is left unchanged.
    expect(funded.collateral).toBe(MathLib.WAD);
  });

  test("should re-anchor the reserves at the accrued indices and timestamp", () => {
    const accrued = venue.accrueInterest(1_000n + SECONDS_PER_YEAR);

    expect(accrued.lastUpdate).toBe(1_000n + SECONDS_PER_YEAR);
    expect(accrued.collateralReserve.index).toBe(accrued.collateralIndex);
    expect(accrued.collateralReserve.lastUpdateTimestamp).toBe(1_000n + SECONDS_PER_YEAR);
    expect(accrued.debtReserve.index).toBe(accrued.debtIndex);
    expect(accrued.debtReserve.lastUpdateTimestamp).toBe(1_000n + SECONDS_PER_YEAR);
  });

  test("should throw on a timestamp prior to the last update", () => {
    expect(() => venue.accrueInterest(500n)).toThrow(IrisCoreErrors.InvalidInterestAccrual);
    expect(() => venue.getAccrualCollateralIndex(500n)).toThrow(
      IrisCoreErrors.InvalidVenueInterestAccrual,
    );
  });

  test("should supply collateral on top of the accrued view", () => {
    const funded = new AaveV3Venue(
      { ...view, collateral: MathLib.WAD },
      venue.collateralReserve,
      venue.debtReserve,
    );

    // Accrued 1.1x over the year, then supplied on top.
    expect(funded.supplyCollateral(MathLib.WAD, 1_000n + SECONDS_PER_YEAR).collateral).toBe(
      2_100_000_000_000_000_000n,
    );
  });

  test("should repay the debt balance", () => {
    const funded = new AaveV3Venue(
      { ...view, debt: MathLib.WAD },
      venue.collateralReserve,
      venue.debtReserve,
    );
    const repaid = funded.repay(MathLib.WAD / 2n, 1_000n);

    expect(repaid.debt).toBe(MathLib.WAD / 2n);
    // The repayment survives a later accrual: the scaled debt re-derives from the balance.
    expect(repaid.accrueInterest(1_000n).debt).toBe(MathLib.WAD / 2n);
    // The original venue is left unchanged.
    expect(funded.debt).toBe(MathLib.WAD);
  });

  test("should borrow onto the debt balance", () => {
    const funded = new AaveV3Venue(
      { ...view, debt: MathLib.WAD },
      venue.collateralReserve,
      venue.debtReserve,
    );
    const borrowed = funded.borrow(MathLib.WAD, 1_000n);

    expect(borrowed.debt).toBe(2n * MathLib.WAD);
    expect(borrowed.accrueInterest(1_000n).debt).toBe(2n * MathLib.WAD);
  });

  test("should withdraw collateral keeping the venue position healthy", () => {
    const funded = new AaveV3Venue(
      { ...view, collateral: MathLib.WAD, price: ORACLE_PRICE_SCALE },
      venue.collateralReserve,
      venue.debtReserve,
    );

    expect(funded.withdrawCollateral(MathLib.WAD, 1_000n).collateral).toBe(0n);
    expect(() => funded.withdrawCollateral(MathLib.WAD + 1n, 1_000n)).toThrow(
      IrisCoreErrors.InsufficientVenueCollateral,
    );
    expect(() =>
      new AaveV3Venue(
        { ...view, collateral: MathLib.WAD },
        venue.collateralReserve,
        venue.debtReserve,
      ).withdrawCollateral(1n, 1_000n),
    ).toThrow(IrisCoreErrors.UnknownVenuePrice);
  });
});

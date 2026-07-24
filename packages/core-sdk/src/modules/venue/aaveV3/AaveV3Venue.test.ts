import { describe, expect, test } from "vitest";
import { SECONDS_PER_YEAR } from "../../../constants.js";
import { IrisCoreErrors } from "../../../errors.js";
import { MathLib } from "../../../math/index.js";
import { AaveV3Venue } from "./AaveV3Venue.js";

describe("AaveV3Venue", () => {
  // Live view placeholders — these tests exercise the accrual model only.
  const view = {
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
});

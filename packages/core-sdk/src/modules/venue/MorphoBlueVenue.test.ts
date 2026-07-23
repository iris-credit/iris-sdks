import { describe, expect, test } from "vitest";
import { SECONDS_PER_YEAR } from "../../constants.js";
import { MathLib } from "../../math/index.js";
import { AdaptiveCurveIrmLib } from "./AdaptiveCurveIrmLib.js";
import { MorphoBlueUtils } from "./MorphoBlueUtils.js";
import { MorphoBlueVenue } from "./MorphoBlueVenue.js";

describe("MorphoBlueVenue", () => {
  const rateAtTarget = 1_268_391_679n; // ~4% per year, per-second WAD rate.
  const venue = new MorphoBlueVenue({
    totalSupplyAssets: MathLib.WAD * 2n,
    totalBorrowAssets: MathLib.WAD,
    totalBorrowShares: MathLib.WAD * 1_000_000n,
    lastUpdate: 1_000n,
    rateAtTarget,
  });

  test("should pin the collateral index and price the debt index at or before the last update", () => {
    const indices = venue.indices(1_000n);

    expect(indices.collateralIndex).toBe(MathLib.RAY);
    expect(indices.debtIndex).toBe(
      MorphoBlueUtils.getDebtIndex({
        totalBorrowAssets: MathLib.WAD,
        totalBorrowShares: MathLib.WAD * 1_000_000n,
      }),
    );
    expect(venue.indices(500n)).toEqual(indices);
  });

  test("should project the debt index at the IRM's average borrow rate", () => {
    const indices = venue.indices(1_000n + SECONDS_PER_YEAR);

    // Growing borrow assets only — shares are accrual-invariant.
    const { avgBorrowRate } = AdaptiveCurveIrmLib.getBorrowRate(
      venue.utilization,
      rateAtTarget,
      SECONDS_PER_YEAR,
    );
    expect(indices.debtIndex).toBe(
      MorphoBlueUtils.getDebtIndex({
        totalBorrowAssets:
          MathLib.WAD +
          MathLib.wMulDown(
            MathLib.WAD,
            MorphoBlueUtils.wTaylorCompounded(avgBorrowRate, SECONDS_PER_YEAR),
          ),
        totalBorrowShares: MathLib.WAD * 1_000_000n,
      }),
    );
    expect(indices.debtIndex).toBeGreaterThan(venue.indices(1_000n).debtIndex);
    expect(indices.collateralIndex).toBe(MathLib.RAY);
  });

  test("should hold the indices constant without a rate model (non-canonical IRM)", () => {
    const idle = new MorphoBlueVenue({ ...venue, rateAtTarget: undefined });

    expect(idle.indices(1_000n + SECONDS_PER_YEAR)).toEqual(idle.indices(1_000n));
  });

  test("should compute utilization as the IRM does", () => {
    expect(venue.utilization).toBe(MathLib.WAD / 2n);
    expect(new MorphoBlueVenue({ ...venue, totalSupplyAssets: 0n }).utilization).toBe(0n);
  });

  test("should hold the rate flat at target utilization (no drift)", () => {
    // Utilization exactly at target: err = 0, so the average rate equals rateAtTarget.
    const atTarget = new MorphoBlueVenue({
      totalSupplyAssets: MathLib.WAD * 10n,
      totalBorrowAssets: MathLib.WAD * 9n,
      totalBorrowShares: MathLib.WAD * 9_000_000n,
      lastUpdate: 1_000n,
      rateAtTarget,
    });

    expect(atTarget.indices(1_000n + SECONDS_PER_YEAR).debtIndex).toBe(
      MorphoBlueUtils.getDebtIndex({
        totalBorrowAssets:
          MathLib.WAD * 9n +
          MathLib.wMulDown(
            MathLib.WAD * 9n,
            MorphoBlueUtils.wTaylorCompounded(rateAtTarget, SECONDS_PER_YEAR),
          ),
        totalBorrowShares: MathLib.WAD * 9_000_000n,
      }),
    );
  });

  test("should outgrow the instantaneous rate above target utilization", () => {
    // Full utilization: err = 1 — the rate starts at 4x rateAtTarget (the curve's fast side)
    // and drifts up over the projection, so the frozen instantaneous rate undershoots.
    const full = new MorphoBlueVenue({
      totalSupplyAssets: MathLib.WAD * 9n,
      totalBorrowAssets: MathLib.WAD * 9n,
      totalBorrowShares: MathLib.WAD * 9_000_000n,
      lastUpdate: 1_000n,
      rateAtTarget,
    });

    expect(full.indices(1_000n + 30n * 86_400n).debtIndex).toBeGreaterThan(
      MorphoBlueUtils.getDebtIndex({
        totalBorrowAssets:
          MathLib.WAD * 9n +
          MathLib.wMulDown(
            MathLib.WAD * 9n,
            MorphoBlueUtils.wTaylorCompounded(rateAtTarget * 4n, 30n * 86_400n),
          ),
        totalBorrowShares: MathLib.WAD * 9_000_000n,
      }),
    );
  });
});

import { describe, expect, test } from "vitest";
import { SECONDS_PER_YEAR } from "../../../constants.js";
import { IrisCoreErrors } from "../../../errors.js";
import { MathLib } from "../../../math/index.js";
import { AdaptiveCurveIrmLib } from "./AdaptiveCurveIrmLib.js";
import { MorphoBlueMath } from "./MorphoBlueMath.js";
import { MorphoBlueVenue } from "./MorphoBlueVenue.js";

describe("MorphoBlueVenue", () => {
  // Live view placeholders — these tests exercise the accrual model only.
  const view = {
    collateral: 0n,
    debt: 0n,
    collateralIndex: MathLib.RAY,
    debtIndex: MathLib.RAY,
    lltv: 0n,
    lastUpdate: 1_000n,
  };

  const rateAtTarget = 1_268_391_679n; // ~4% per year, per-second WAD rate.
  const market = {
    totalSupplyAssets: MathLib.WAD * 2n,
    totalBorrowAssets: MathLib.WAD,
    totalBorrowShares: MathLib.WAD * 1_000_000n,
    lastUpdate: 1_000n,
  };
  const position = { borrowShares: 0n, collateral: 0n };

  const venue = new MorphoBlueVenue(view, market, position, rateAtTarget);

  /** The venue adapter's debt index: borrow assets per share, scaled to RAY. */
  const debtIndex = (accrued: { totalBorrowAssets: bigint; totalBorrowShares: bigint }) =>
    MathLib.mulDivDown(
      accrued.totalBorrowAssets + MorphoBlueMath.VIRTUAL_ASSETS,
      MorphoBlueMath.INDEX_SCALE,
      accrued.totalBorrowShares + MorphoBlueMath.VIRTUAL_SHARES,
    );

  test("should pin the collateral index and keep the debt index at the last update", () => {
    const accrued = venue.accrueInterest(1_000n);

    expect(accrued.collateralIndex).toBe(MathLib.RAY);
    expect(accrued.debtIndex).toBe(debtIndex(market));
  });

  test("should accrue the debt index at the IRM's average borrow rate", () => {
    const accrued = venue.accrueInterest(1_000n + SECONDS_PER_YEAR);

    // Growing borrow assets only — shares are accrual-invariant.
    const { avgBorrowRate } = AdaptiveCurveIrmLib.getBorrowRate(
      venue.utilization,
      rateAtTarget,
      SECONDS_PER_YEAR,
    );
    expect(accrued.debtIndex).toBe(
      debtIndex({
        totalBorrowAssets:
          MathLib.WAD +
          MathLib.wMulDown(
            MathLib.WAD,
            MorphoBlueMath.wTaylorCompounded(avgBorrowRate, SECONDS_PER_YEAR),
          ),
        totalBorrowShares: MathLib.WAD * 1_000_000n,
      }),
    );
    expect(accrued.debtIndex).toBeGreaterThan(venue.accrueInterest(1_000n).debtIndex);
    expect(accrued.collateralIndex).toBe(MathLib.RAY);
  });

  test("should hold the indices constant without a rate model (non-canonical IRM)", () => {
    const idle = new MorphoBlueVenue(view, market, position);

    expect(idle.accrueInterest(1_000n + SECONDS_PER_YEAR).debtIndex).toBe(
      idle.accrueInterest(1_000n).debtIndex,
    );
  });

  test("should accrue the pod's debt from its borrow shares and keep the collateral idle", () => {
    const funded = new MorphoBlueVenue(
      { ...view, collateral: 5n, debt: MathLib.WAD },
      market,
      // All the market's shares: the pod owes the accrued totals (rounded up).
      { borrowShares: MathLib.WAD * 1_000_000n, collateral: 5n },
      rateAtTarget,
    );
    const accrued = funded.accrueInterest(1_000n + SECONDS_PER_YEAR);

    expect(accrued.debt).toBeGreaterThan(MathLib.WAD);
    expect(accrued.collateral).toBe(5n);
    expect(accrued.lastUpdate).toBe(1_000n + SECONDS_PER_YEAR);
  });

  test("should re-anchor the market at the accrued state", () => {
    const accrued = venue.accrueInterest(1_000n + SECONDS_PER_YEAR);

    expect(accrued.market.lastUpdate).toBe(1_000n + SECONDS_PER_YEAR);
    expect(accrued.market.totalBorrowAssets).toBeGreaterThan(market.totalBorrowAssets);
    // Below-target utilization: the adaptive rate decays over the window.
    expect(accrued.rateAtTarget).toBeLessThan(rateAtTarget);
  });

  test("should throw on a timestamp prior to the last update", () => {
    expect(() => venue.accrueInterest(500n)).toThrow(IrisCoreErrors.InvalidInterestAccrual);
    expect(() => venue.getAccrualDebtIndex(500n)).toThrow(
      IrisCoreErrors.InvalidVenueInterestAccrual,
    );
  });

  test("should compute utilization as the IRM does", () => {
    expect(venue.utilization).toBe(MathLib.WAD / 2n);
    expect(
      new MorphoBlueVenue(view, { ...market, totalSupplyAssets: 0n }, position).utilization,
    ).toBe(0n);
  });

  test("should hold the rate flat at target utilization (no drift)", () => {
    // Utilization exactly at target: err = 0, so the average rate equals rateAtTarget.
    const atTarget = new MorphoBlueVenue(
      view,
      {
        totalSupplyAssets: MathLib.WAD * 10n,
        totalBorrowAssets: MathLib.WAD * 9n,
        totalBorrowShares: MathLib.WAD * 9_000_000n,
        lastUpdate: 1_000n,
      },
      position,
      rateAtTarget,
    );

    expect(atTarget.accrueInterest(1_000n + SECONDS_PER_YEAR).debtIndex).toBe(
      debtIndex({
        totalBorrowAssets:
          MathLib.WAD * 9n +
          MathLib.wMulDown(
            MathLib.WAD * 9n,
            MorphoBlueMath.wTaylorCompounded(rateAtTarget, SECONDS_PER_YEAR),
          ),
        totalBorrowShares: MathLib.WAD * 9_000_000n,
      }),
    );
  });

  test("should outgrow the instantaneous rate above target utilization", () => {
    // Full utilization: err = 1 — the rate starts at 4x rateAtTarget (the curve's fast side)
    // and drifts up over the accrual, so the frozen instantaneous rate undershoots.
    const full = new MorphoBlueVenue(
      view,
      {
        totalSupplyAssets: MathLib.WAD * 9n,
        totalBorrowAssets: MathLib.WAD * 9n,
        totalBorrowShares: MathLib.WAD * 9_000_000n,
        lastUpdate: 1_000n,
      },
      position,
      rateAtTarget,
    );

    expect(full.accrueInterest(1_000n + 30n * 86_400n).debtIndex).toBeGreaterThan(
      debtIndex({
        totalBorrowAssets:
          MathLib.WAD * 9n +
          MathLib.wMulDown(
            MathLib.WAD * 9n,
            MorphoBlueMath.wTaylorCompounded(rateAtTarget * 4n, 30n * 86_400n),
          ),
        totalBorrowShares: MathLib.WAD * 9_000_000n,
      }),
    );
  });
});

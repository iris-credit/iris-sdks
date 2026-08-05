import { describe, expect, test } from "vitest";
import { ORACLE_PRICE_SCALE, SECONDS_PER_YEAR } from "../../../constants.js";
import { IrisCoreErrors } from "../../../errors.js";
import { MathLib } from "../../../math/index.js";
import { VenueName } from "../../../registries.js";
import { AdaptiveCurveIrmLib } from "./AdaptiveCurveIrmLib.js";
import { MorphoBlueMath } from "./MorphoBlueMath.js";
import { MorphoBlueVenue } from "./MorphoBlueVenue.js";

describe("MorphoBlueVenue", () => {
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

  test("should carry its venue name", () => {
    expect(venue.name).toBe(VenueName.MorphoBlue);
  });

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
    // The interest is credited to both sides, as Morpho's _accrueInterest does.
    expect(accrued.market.totalSupplyAssets - market.totalSupplyAssets).toBe(
      accrued.market.totalBorrowAssets - market.totalBorrowAssets,
    );
    // Below-target utilization: the adaptive rate decays over the window.
    expect(accrued.rateAtTarget).toBeLessThan(rateAtTarget);
  });

  test("should throw on a timestamp prior to the last update", () => {
    // Not pinned to an error class: which accrual guard fires first is an implementation detail.
    expect(() => venue.accrueInterest(500n)).toThrow("can't be prior to last update");
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

  test("should supply collateral to the view and the position primitives", () => {
    const funded = new MorphoBlueVenue(
      { ...view, collateral: 5n },
      market,
      { borrowShares: 0n, collateral: 5n },
      rateAtTarget,
    );
    const supplied = funded.supplyCollateral(3n, 1_000n);

    expect(supplied.collateral).toBe(8n);
    expect(supplied.position.collateral).toBe(8n);
    // The original position primitives are left untouched.
    expect(funded.position.collateral).toBe(5n);
  });

  test("should repay by burning the pod's and the market's borrow shares", () => {
    const funded = new MorphoBlueVenue(
      { ...view, debt: MathLib.WAD },
      market,
      // All the market's shares: the pod owes the whole borrow.
      { borrowShares: MathLib.WAD * 1_000_000n, collateral: 0n },
      rateAtTarget,
    );
    const repaid = funded.repay(MathLib.WAD / 2n, 1_000n);

    expect(repaid.debt).toBe(MathLib.WAD / 2n);
    // Half the assets burn half the shares, on the pod and on the market.
    expect(repaid.position.borrowShares).toBe((MathLib.WAD * 1_000_000n) / 2n);
    expect(repaid.market.totalBorrowShares).toBe((MathLib.WAD * 1_000_000n) / 2n);
    expect(repaid.market.totalBorrowAssets).toBe(MathLib.WAD / 2n);
    // The repayment survives a later accrual: the debt is priced from the burnt shares.
    expect(repaid.accrueInterest(1_000n).debt).toBe(MathLib.WAD / 2n);
    // The original position primitives are left untouched.
    expect(funded.position.borrowShares).toBe(MathLib.WAD * 1_000_000n);
  });

  test("should burn the pod's shares outright on a full repayment", () => {
    // A market above one asset per share: the debt is priced up from the pod's shares, so
    // converting it back down would burn more shares than it holds.
    const funded = new MorphoBlueVenue(
      view,
      { ...market, totalBorrowAssets: 1_234_567_890_123_456_789n },
      { borrowShares: MathLib.WAD * 1_000_000n, collateral: 0n },
      rateAtTarget,
    ).accrueInterest(1_000n);
    const repaid = funded.repay(funded.debt, 1_000n);

    expect(repaid.debt).toBe(0n);
    expect(repaid.position.borrowShares).toBe(0n);
    expect(repaid.market.totalBorrowShares).toBe(0n);
  });

  test("should price a partial repayment from the market", () => {
    const funded = new MorphoBlueVenue(
      { ...view, debt: MathLib.WAD },
      market,
      { borrowShares: MathLib.WAD * 1_000_000n, collateral: 0n },
      rateAtTarget,
    );
    const repaid = funded.repay(MathLib.WAD / 2n, 1_000n);

    // Half the assets burn half the shares, leaving the rest owed.
    expect(repaid.debt).toBe(MathLib.WAD / 2n);
    expect(repaid.position.borrowShares).toBe((MathLib.WAD * 1_000_000n) / 2n);
    expect(repaid.market.totalBorrowShares).toBe((MathLib.WAD * 1_000_000n) / 2n);
  });

  test("should throw when the repayment exceeds the pod's debt", () => {
    const funded = new MorphoBlueVenue(
      { ...view, debt: MathLib.WAD },
      market,
      { borrowShares: MathLib.WAD * 1_000_000n, collateral: 0n },
      rateAtTarget,
    );

    expect(() => funded.repay(MathLib.WAD * 2n, 1_000n)).toThrow(
      IrisCoreErrors.InsufficientVenuePosition,
    );
  });

  test("should borrow by minting the pod's and the market's borrow shares", () => {
    const borrowed = venue.borrow(MathLib.WAD, 1_000n);

    expect(borrowed.debt).toBe(MathLib.WAD);
    // The market doubles: the borrow mints as many shares as were already outstanding.
    expect(borrowed.position.borrowShares).toBe(MathLib.WAD * 1_000_000n);
    expect(borrowed.market.totalBorrowShares).toBe(MathLib.WAD * 2_000_000n);
    expect(borrowed.market.totalBorrowAssets).toBe(MathLib.WAD * 2n);
    // The borrow survives a later accrual: the debt is priced from the minted shares.
    expect(borrowed.accrueInterest(1_000n).debt).toBe(MathLib.WAD);
    // The original position primitives are left untouched.
    expect(venue.position.borrowShares).toBe(0n);
  });

  test("should throw when the borrow exceeds the market's supply", () => {
    // Borrowing the whole idle liquidity is allowed; one wei past it is not.
    expect(venue.borrow(MathLib.WAD, 1_000n).market.totalBorrowAssets).toBe(
      market.totalSupplyAssets,
    );
    expect(() => venue.borrow(MathLib.WAD + 1n, 1_000n)).toThrow(
      IrisCoreErrors.InsufficientVenueLiquidity,
    );
  });

  test("should withdraw collateral keeping the venue position healthy", () => {
    const funded = new MorphoBlueVenue(
      { ...view, collateral: 5n, price: ORACLE_PRICE_SCALE },
      market,
      { borrowShares: 0n, collateral: 5n },
      rateAtTarget,
    );
    const withdrawn = funded.withdrawCollateral(2n, 1_000n);

    expect(withdrawn.collateral).toBe(3n);
    expect(withdrawn.position.collateral).toBe(3n);
    expect(() => funded.withdrawCollateral(6n, 1_000n)).toThrow(
      IrisCoreErrors.InsufficientVenueCollateral,
    );
    expect(() => venue.withdrawCollateral(1n, 1_000n)).toThrow(IrisCoreErrors.UnknownVenuePrice);
  });

  // A priced venue at an 80% LLTV, over the same WAD-per-million-shares market.
  const priced = new MorphoBlueVenue(
    { ...view, lltv: 800_000_000_000_000_000n, price: ORACLE_PRICE_SCALE },
    market,
    position,
    rateAtTarget,
  );

  test("should bound a borrow by the LLTV through the shares round-trip", () => {
    // 1 collateral at a 1:1 price and an 80% LLTV — the round-trip keeps it whole here.
    expect(priced.getMaxBorrowAmount(MathLib.WAD, 1_000n)).toBe(800_000_000_000_000_000n);
    expect(priced.getMaxBorrowAmount(0n, 1_000n)).toBe(0n);
    // Ten collaterals outgrow the market: the idle wad of supply caps the bound.
    expect(priced.getMaxBorrowAmount(10n * MathLib.WAD, 1_000n)).toBe(MathLib.WAD);
  });

  test("should price the borrow bound's round-trip on the accrued market", () => {
    const accrued = priced.accrueInterest(1_000n + SECONDS_PER_YEAR);

    // Recompute on the accrued totals — borrow shares are accrual-invariant.
    const expected = MorphoBlueMath.toAssetsDown(
      MorphoBlueMath.toSharesDown(
        800_000_000_000_000_000n,
        accrued.market.totalBorrowAssets,
        accrued.market.totalBorrowShares,
      ),
      accrued.market.totalBorrowAssets,
      accrued.market.totalBorrowShares,
    );
    expect(priced.getMaxBorrowAmount(MathLib.WAD, 1_000n + SECONDS_PER_YEAR)).toBe(expected);
    // The accrued venue answers the same at its own `lastUpdate` default.
    expect(accrued.getMaxBorrowAmount(MathLib.WAD)).toBe(expected);
  });

  test("should return undefined for a borrow bound without a price", () => {
    expect(venue.getMaxBorrowAmount(MathLib.WAD, 1_000n)).toBeUndefined();
  });

  test("should bound the borrow capacity by the market's idle supply", () => {
    // 2 supplied against 1 borrowed: exactly the wad the borrow guard admits.
    expect(venue.getMaxBorrowCapacity(1_000n)).toBe(MathLib.WAD);
    // Interest credits both sides, so the idle supply — and the capacity — hold steady.
    expect(venue.getMaxBorrowCapacity(1_000n + SECONDS_PER_YEAR)).toBe(MathLib.WAD);
  });

  test("should lower the borrow capacity to a target utilization", () => {
    // 75% of the 2-wad supply is 1.5: half a wad above the current borrow.
    expect(venue.getMaxBorrowCapacity(1_000n, 750_000_000_000_000_000n)).toBe(MathLib.WAD / 2n);
    // A target below the current utilization floors at zero.
    expect(venue.getMaxBorrowCapacity(1_000n, 250_000_000_000_000_000n)).toBe(0n);
  });

  test("should report unlimited supply capacity", () => {
    expect(venue.getMaxSupplyCapacity()).toBe(MathLib.MAX_UINT_256);
  });
});

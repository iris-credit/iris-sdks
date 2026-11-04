import { describe, expect, test } from "vitest";
import { ORACLE_PRICE_SCALE, SECONDS_PER_YEAR } from "../../../constants.js";
import { IrisCoreErrors } from "../../../errors.js";
import { MathLib } from "../../../math/index.js";
import { VenueName } from "../../../registries.js";
import { SparkLendVenue } from "./SparkLendVenue.js";

describe("SparkLendVenue", () => {
  // Live view placeholders — these tests exercise the accrual model only.
  const view = {
    id: 2n,
    data: "0x" as const,
    pod: "0x0000000000000000000000000000000000000001" as const,
    collateral: 0n,
    debt: 0n,
    collateralIndex: MathLib.RAY,
    debtIndex: MathLib.RAY,
    lltv: 0n,
    lastUpdate: 1_000n,
  };

  // Reserves at RAY indices: 10% linear on the collateral's liquidity side, 20% compounding on
  // the debt's borrow side.
  const venue = new SparkLendVenue(
    view,
    {
      configuration: 0n,
      liquidityIndex: MathLib.RAY,
      currentLiquidityRate: MathLib.RAY / 10n,
      variableBorrowIndex: MathLib.RAY,
      currentVariableBorrowRate: 0n,
      lastUpdateTimestamp: 1_000n,
      accruedToTreasury: 0n,
    },
    {
      configuration: 0n,
      liquidityIndex: MathLib.RAY,
      currentLiquidityRate: 0n,
      variableBorrowIndex: MathLib.RAY,
      currentVariableBorrowRate: MathLib.RAY / 5n,
      lastUpdateTimestamp: 1_000n,
      accruedToTreasury: 0n,
    },
  );

  test("should carry its venue name", () => {
    expect(venue.name).toBe(VenueName.SparkLend);
  });

  test("should compound the debt reserve's rate per second into the borrow APY", () => {
    expect(venue.borrowApy).toBe(221_402_757_385_561_290n);
    expect(
      new SparkLendVenue(view, venue.collateralReserve, venue.collateralReserve).borrowApy,
    ).toBe(0n);
  });

  test("should keep the stored indices at the reserves' last update", () => {
    const accrued = venue.accrueInterest(1_000n);

    expect(accrued.collateralIndex).toBe(MathLib.RAY);
    expect(accrued.debtIndex).toBe(MathLib.RAY);
  });

  test("should accrue the collateral index linearly", () => {
    expect(venue.accrueInterest(1_000n + SECONDS_PER_YEAR).collateralIndex).toBe(
      MathLib.RAY + MathLib.RAY / 10n,
    );
  });

  test("should compound the debt index binomially", () => {
    // 20% over a year through SparkLend's binomial approximation: above the linear 1.2 RAY,
    // below the continuous e^0.2.
    expect(venue.accrueInterest(1_000n + SECONDS_PER_YEAR).debtIndex).toBe(
      1_221_332_933_560_973_813_055_552_000n,
    );
  });

  test("should hold the debt index still while the reserve has no variable debt", () => {
    const empty = new SparkLendVenue(view, venue.collateralReserve, venue.debtReserve, undefined, {
      price: 0n,
      vTokenScaledTotalSupply: 0n,
      underlyingBalance: 0n,
    });

    expect(empty.getAccrualDebtIndex(1_000n + SECONDS_PER_YEAR)).toBe(MathLib.RAY);
    // Without the data the accrual is assumed.
    expect(venue.getAccrualDebtIndex(1_000n + SECONDS_PER_YEAR)).toBeGreaterThan(MathLib.RAY);
  });

  test("should grow the pod's assets with their index", () => {
    const funded = new SparkLendVenue(
      { ...view, collateral: MathLib.WAD, debt: MathLib.WAD },
      venue.collateralReserve,
      venue.debtReserve,
    );
    const accrued = funded.accrueInterest(1_000n + SECONDS_PER_YEAR);

    expect(accrued.collateral).toBe(1_100_000_000_000_000_000n);
    expect(accrued.debt).toBe(1_221_332_933_560_973_813n);
    // The original view is left unchanged.
    expect(funded.collateral).toBe(MathLib.WAD);
  });

  test("should re-anchor the reserves at the accrued indices and timestamp", () => {
    const accrued = venue.accrueInterest(1_000n + SECONDS_PER_YEAR);

    expect(accrued.lastUpdate).toBe(1_000n + SECONDS_PER_YEAR);
    expect(accrued.collateralReserve.liquidityIndex).toBe(accrued.collateralIndex);
    expect(accrued.collateralReserve.lastUpdateTimestamp).toBe(1_000n + SECONDS_PER_YEAR);
    expect(accrued.debtReserve.variableBorrowIndex).toBe(accrued.debtIndex);
    expect(accrued.debtReserve.lastUpdateTimestamp).toBe(1_000n + SECONDS_PER_YEAR);
  });

  test("should throw on a timestamp prior to the last update", () => {
    expect(() => venue.accrueInterest(500n)).toThrow(IrisCoreErrors.InvalidInterestAccrual);
    expect(() => venue.getAccrualCollateralIndex(500n)).toThrow(
      IrisCoreErrors.InvalidVenueInterestAccrual,
    );
  });

  test("should supply collateral on top of the accrued view", () => {
    const funded = new SparkLendVenue(
      { ...view, collateral: MathLib.WAD },
      venue.collateralReserve,
      venue.debtReserve,
    );

    expect(funded.supplyCollateral(MathLib.WAD, 1_000n + SECONDS_PER_YEAR).collateral).toBe(
      2_100_000_000_000_000_000n,
    );
  });

  test("should repay the debt balance", () => {
    const funded = new SparkLendVenue(
      { ...view, debt: MathLib.WAD },
      venue.collateralReserve,
      venue.debtReserve,
    );
    const repaid = funded.repay(MathLib.WAD / 2n, 1_000n);

    expect(repaid.debt).toBe(MathLib.WAD / 2n);
    expect(repaid.accrueInterest(1_000n).debt).toBe(MathLib.WAD / 2n);
    expect(funded.debt).toBe(MathLib.WAD);
    expect(() => funded.repay(MathLib.WAD * 2n, 1_000n)).toThrow(
      IrisCoreErrors.InsufficientVenuePosition,
    );
  });

  test("should borrow onto the debt balance", () => {
    const funded = new SparkLendVenue(
      { ...view, debt: MathLib.WAD },
      venue.collateralReserve,
      venue.debtReserve,
    );
    const borrowed = funded.borrow(MathLib.WAD, 1_000n);

    expect(borrowed.debt).toBe(2n * MathLib.WAD);
    expect(borrowed.accrueInterest(1_000n).debt).toBe(2n * MathLib.WAD);
  });

  test("should withdraw collateral keeping the venue position healthy", () => {
    const funded = new SparkLendVenue(
      { ...view, collateral: MathLib.WAD, price: ORACLE_PRICE_SCALE },
      venue.collateralReserve,
      venue.debtReserve,
    );

    expect(funded.withdrawCollateral(MathLib.WAD, 1_000n).collateral).toBe(0n);
    expect(() => funded.withdrawCollateral(MathLib.WAD + 1n, 1_000n)).toThrow(
      IrisCoreErrors.InsufficientVenueCollateral,
    );
    expect(() =>
      new SparkLendVenue(
        { ...view, collateral: MathLib.WAD },
        venue.collateralReserve,
        venue.debtReserve,
      ).withdrawCollateral(1n, 1_000n),
    ).toThrow(IrisCoreErrors.UnknownVenuePrice);
  });

  // WETH-shaped collateral into USDC-shaped debt: 80% max LTV, prices in an 8-decimals base
  // currency (2000 vs 1), reserves at RAY indices.
  const configured = new SparkLendVenue(
    view,
    { ...venue.collateralReserve, configuration: (18n << 48n) | 8_000n },
    { ...venue.debtReserve, configuration: (1n << 58n) | (1n << 56n) | (6n << 48n) | 7_700n },
    { price: 2_000n * 10n ** 8n, spTokenScaledTotalSupply: 0n, vTokenScaledTotalSupply: 0n },
    {
      price: 10n ** 8n,
      vTokenScaledTotalSupply: 1_500_000_000n,
      underlyingBalance: 10_000_000_000n,
    },
  );

  test("should expose the collateral reserve's max LTV scaled to WAD", () => {
    expect(configured.ltv).toBe((8n * MathLib.WAD) / 10n);
  });

  test("should bound a borrow by the collateral reserve's max LTV", () => {
    // 1 collateral × 2000 × 80% = 1600 debt units.
    expect(configured.getMaxBorrowAmount(MathLib.WAD, { timestamp: 1_000n })).toBe(1_600_000_000n);
  });

  test("should measure the borrow bound at a tighter LTV, capped by the reserve's own", () => {
    expect(
      configured.getMaxBorrowAmount(MathLib.WAD, {
        maxLtv: (4n * MathLib.WAD) / 10n,
        timestamp: 1_000n,
      }),
    ).toBe(800_000_000n);
    expect(
      configured.getMaxBorrowAmount(MathLib.WAD, {
        maxLtv: (9n * MathLib.WAD) / 10n,
        timestamp: 1_000n,
      }),
    ).toBe(1_600_000_000n);
  });

  test("should run the borrow bound through the venue's half-up token scaling", () => {
    // One year in (liquidity 1.1 RAY): the half-up mint and read-back recover the full collateral,
    // where Aave v3.6's floors shed two wei of debt.
    expect(
      configured.getMaxBorrowAmount(MathLib.WAD, { timestamp: 1_000n + SECONDS_PER_YEAR }),
    ).toBe(1_600_000_000n);
  });

  test("should admit validateBorrow's half-up percentDiv at the venue's own LTV", () => {
    // Whole-unit tokens priced at 1: 6 units of collateral back 5 of debt at 80%, since
    // `percentDiv(5, 80%)` rounds 6.25 down to 6; a plain 80% bound would stop at 4.
    const whole = new SparkLendVenue(
      view,
      { ...venue.collateralReserve, configuration: 8_000n },
      { ...venue.debtReserve, configuration: (1n << 58n) | (1n << 56n) },
      { price: 1n, spTokenScaledTotalSupply: 0n, vTokenScaledTotalSupply: 0n },
      { price: 1n, vTokenScaledTotalSupply: 0n, underlyingBalance: 1_000n },
    );

    expect(whole.getMaxBorrowAmount(6n, { timestamp: 1_000n })).toBe(5n);
    // A tighter LTV bounds the floored debt value by the collateral value at that LTV.
    expect(
      whole.getMaxBorrowAmount(6n, { maxLtv: (79n * MathLib.WAD) / 100n, timestamp: 1_000n }),
    ).toBe(4n);
  });

  test("should return zero for a borrow on zero collateral, zero value or a zero max LTV", () => {
    expect(configured.getMaxBorrowAmount(0n, { timestamp: 1_000n })).toBe(0n);
    // A wei of an 18-decimals collateral prices to zero base currency, which SparkLend rejects.
    expect(configured.getMaxBorrowAmount(1n, { timestamp: 1_000n })).toBe(0n);
    expect(
      new SparkLendVenue(
        view,
        { ...configured.collateralReserve, configuration: 18n << 48n },
        configured.debtReserve,
        configured.collateralData,
        configured.debtData,
      ).getMaxBorrowAmount(MathLib.WAD, { timestamp: 1_000n }),
    ).toBe(0n);
  });

  test("should return undefined for a borrow bound without the data", () => {
    expect(venue.getMaxBorrowAmount(MathLib.WAD, { timestamp: 1_000n })).toBeUndefined();
  });

  test("should cap the borrow bound by the borrow capacity", () => {
    // The 1600 LTV bound meets a debt reserve with only 500 of cap headroom left.
    const capped = new SparkLendVenue(
      view,
      configured.collateralReserve,
      openForBorrow.debtReserve,
      configured.collateralData,
      openForBorrow.debtData,
    );

    expect(capped.getMaxBorrowAmount(MathLib.WAD, { timestamp: 1_000n })).toBe(500_000_000n);
  });

  // A USDC-shaped debt reserve open for borrowing under a 2000 cap: 3500 of held liquidity
  // against 1500 of scaled debt, at RAY indices.
  const borrowableConfiguration = (2_000n << 80n) | (1n << 58n) | (1n << 56n) | (6n << 48n);
  const openForBorrow = new SparkLendVenue(
    view,
    venue.collateralReserve,
    { ...venue.debtReserve, configuration: borrowableConfiguration },
    undefined,
    {
      price: 10n ** 8n,
      vTokenScaledTotalSupply: 1_500_000_000n,
      underlyingBalance: 3_500_000_000n,
    },
  );

  test("should bound the borrow capacity by the cap's headroom over the debt", () => {
    expect(openForBorrow.getMaxBorrowCapacity(1_000n)).toBe(500_000_000n);
    // One year in (borrow index ~1.2213 RAY), the half-up debt read leaves 168.0006.
    expect(openForBorrow.getMaxBorrowCapacity(1_000n + SECONDS_PER_YEAR)).toBe(168_000_600n);
  });

  test("should bound the borrow capacity by the spToken's held liquidity without a cap", () => {
    const uncapped = new SparkLendVenue(
      view,
      venue.collateralReserve,
      { ...openForBorrow.debtReserve, configuration: (1n << 58n) | (1n << 56n) | (6n << 48n) },
      undefined,
      openForBorrow.debtData,
    );

    expect(uncapped.getMaxBorrowCapacity(1_000n)).toBe(3_500_000_000n);
  });

  test("should return zero borrow capacity when the reserve is not borrowable", () => {
    // Paused; and a 1000 cap already outgrown by the 1500 of debt.
    expect(
      new SparkLendVenue(
        view,
        venue.collateralReserve,
        { ...openForBorrow.debtReserve, configuration: borrowableConfiguration | (1n << 60n) },
        undefined,
        openForBorrow.debtData,
      ).getMaxBorrowCapacity(1_000n),
    ).toBe(0n);
    expect(
      new SparkLendVenue(
        view,
        venue.collateralReserve,
        {
          ...openForBorrow.debtReserve,
          configuration: (1_000n << 80n) | (1n << 58n) | (1n << 56n) | (6n << 48n),
        },
        undefined,
        openForBorrow.debtData,
      ).getMaxBorrowCapacity(1_000n),
    ).toBe(0n);
  });

  // A WETH-shaped collateral reserve under a 1000 supply cap: 900 scaled spTokens, 100 scaled debt
  // at a 20% borrow rate feeding a 10% reserve factor, at RAY indices.
  const suppliableConfiguration = (1_000n << 116n) | (1_000n << 64n) | (1n << 56n) | (18n << 48n);
  const openForSupply = new SparkLendVenue(
    view,
    {
      ...venue.collateralReserve,
      configuration: suppliableConfiguration,
      currentVariableBorrowRate: MathLib.RAY / 5n,
    },
    venue.debtReserve,
    {
      price: 0n,
      spTokenScaledTotalSupply: 900n * MathLib.WAD,
      vTokenScaledTotalSupply: 100n * MathLib.WAD,
    },
  );

  test("should bound the supply capacity by the cap's headroom over the supply", () => {
    expect(openForSupply.getMaxSupplyCapacity(1_000n)).toBe(100n * MathLib.WAD);
    // One year in (liquidity 1.1 RAY), the treasury's pending mint eats into the headroom the
    // grown index leaves.
    expect(openForSupply.getMaxSupplyCapacity(1_000n + SECONDS_PER_YEAR)).toBe(
      7_786_670_664_390_261_868n,
    );
  });

  test("should fold the treasury's pending mint when re-anchoring the reserves", () => {
    expect(openForSupply.accrueInterest(1_000n + SECONDS_PER_YEAR).getMaxSupplyCapacity()).toBe(
      openForSupply.getMaxSupplyCapacity(1_000n + SECONDS_PER_YEAR),
    );
  });

  test("should round the treasury's debt accrual from half-up balance reads", () => {
    // 3 wei of scaled debt compounding 50% over a year under a 100% reserve factor and a
    // 10-token cap at 0 decimals: the debt reads 3 then 5 (4.94 rounds up), so the treasury
    // accrues 2 wei, leaving 3 of the cap's 10 over the 5 supplied.
    const rounding = new SparkLendVenue(
      view,
      {
        configuration: (10n << 116n) | (10_000n << 64n) | (1n << 56n),
        liquidityIndex: MathLib.RAY,
        currentLiquidityRate: 0n,
        variableBorrowIndex: MathLib.RAY,
        currentVariableBorrowRate: MathLib.RAY / 2n,
        lastUpdateTimestamp: 1_000n,
        accruedToTreasury: 0n,
      },
      venue.debtReserve,
      { price: 0n, spTokenScaledTotalSupply: 5n, vTokenScaledTotalSupply: 3n },
    );

    expect(rounding.getMaxSupplyCapacity(1_000n + SECONDS_PER_YEAR)).toBe(3n);
  });

  test("should return unlimited supply capacity without a cap and zero when frozen", () => {
    expect(
      new SparkLendVenue(
        view,
        { ...openForSupply.collateralReserve, configuration: (1n << 56n) | (18n << 48n) },
        venue.debtReserve,
        openForSupply.collateralData,
      ).getMaxSupplyCapacity(1_000n),
    ).toBe(MathLib.MAX_UINT_256);
    expect(
      new SparkLendVenue(
        view,
        {
          ...openForSupply.collateralReserve,
          configuration: suppliableConfiguration | (1n << 57n),
        },
        venue.debtReserve,
        openForSupply.collateralData,
      ).getMaxSupplyCapacity(1_000n),
    ).toBe(0n);
  });

  test("should return undefined capacities without the data", () => {
    expect(venue.getMaxBorrowCapacity(1_000n)).toBeUndefined();
    expect(venue.getMaxSupplyCapacity(1_000n)).toBeUndefined();
  });
});

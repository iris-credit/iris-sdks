import { describe, expect, test } from "vitest";
import { ORACLE_PRICE_SCALE, SECONDS_PER_YEAR } from "../../../constants.js";
import { IrisCoreErrors } from "../../../errors.js";
import { MathLib } from "../../../math/index.js";
import { VenueName } from "../../../registries.js";
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

  // Reserves at RAY indices: 10% linear on the collateral's liquidity side, 20%
  // compounding on the debt's borrow side.
  const venue = new AaveV3Venue(
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
    expect(venue.name).toBe(VenueName.AaveV3);
  });

  test("should compound the debt reserve's rate per second into the borrow APY", () => {
    // 20% APR compounded every second over a year, as the Aave app quotes it — just
    // under the continuous e^0.2 - 1.
    expect(venue.borrowApy).toBe(221_402_757_385_561_290n);
    // A rate-less reserve compounds to nothing.
    expect(new AaveV3Venue(view, venue.collateralReserve, venue.collateralReserve).borrowApy).toBe(
      0n,
    );
  });

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

  test("should hold the debt index still while the reserve has no variable debt", () => {
    // `_updateIndexes` only advances the borrow index while variable debt exists; a
    // zero scaled supply pins it despite the 20% rate.
    const empty = new AaveV3Venue(view, venue.collateralReserve, venue.debtReserve, undefined, {
      price: 0n,
      aTokenScaledTotalSupply: 0n,
      vTokenScaledTotalSupply: 0n,
      underlyingBalance: 0n,
      virtualUnderlyingBalance: 0n,
    });

    expect(empty.getAccrualDebtIndex(1_000n + SECONDS_PER_YEAR)).toBe(MathLib.RAY);
    // Without the data the accrual is assumed.
    expect(venue.getAccrualDebtIndex(1_000n + SECONDS_PER_YEAR)).toBeGreaterThan(MathLib.RAY);
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
    // Repaying past the debt is rejected rather than going negative.
    expect(() => funded.repay(MathLib.WAD * 2n, 1_000n)).toThrow(
      IrisCoreErrors.InsufficientVenuePosition,
    );
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

  // WETH-shaped collateral into USDC-shaped debt: 80% max LTV, prices in an 8-decimals
  // base currency (2000 vs 1), reserves at RAY indices.
  const configured = new AaveV3Venue(
    view,
    { ...venue.collateralReserve, configuration: (18n << 48n) | 8_000n },
    { ...venue.debtReserve, configuration: (1n << 58n) | (1n << 56n) | (6n << 48n) | 7_700n },
    { price: 2_000n * 10n ** 8n, aTokenScaledTotalSupply: 0n, vTokenScaledTotalSupply: 0n },
    {
      price: 10n ** 8n,
      aTokenScaledTotalSupply: 10_000_000_000n,
      vTokenScaledTotalSupply: 1_500_000_000n,
      underlyingBalance: 10_000_000_000n,
      virtualUnderlyingBalance: 10_000_000_000n,
    },
  );

  test("should expose the collateral reserve's max LTV scaled to WAD", () => {
    expect(configured.ltv).toBe((8n * MathLib.WAD) / 10n);
  });

  test("should bound a borrow by the collateral reserve's max LTV", () => {
    // 1 collateral × 2000 × 80% = 1600 debt units, unrounded at RAY indices.
    expect(configured.getMaxBorrowAmount(MathLib.WAD, 1_000n)).toBe(1_600_000_000n);
  });

  test("should run the borrow bound through the venue's token scaling", () => {
    // One year in (liquidity 1.1 RAY, borrow ~1.2213 RAY): the floored aToken read-back
    // prices to 1599999999 debt units; the vToken round-trip sheds one more wei.
    expect(configured.getMaxBorrowAmount(MathLib.WAD, 1_000n + SECONDS_PER_YEAR)).toBe(
      1_599_999_998n,
    );
  });

  test("should return zero for a borrow on zero collateral or a zero max LTV", () => {
    expect(configured.getMaxBorrowAmount(0n, 1_000n)).toBe(0n);
    expect(
      new AaveV3Venue(
        view,
        { ...configured.collateralReserve, configuration: 18n << 48n },
        configured.debtReserve,
        configured.collateralData,
        configured.debtData,
      ).getMaxBorrowAmount(MathLib.WAD, 1_000n),
    ).toBe(0n);
  });

  test("should return undefined for a borrow bound without the data", () => {
    expect(venue.getMaxBorrowAmount(MathLib.WAD, 1_000n)).toBeUndefined();
  });

  test("should cap the borrow bound by the borrow capacity", () => {
    // The 1600 LTV bound meets a debt reserve with only 500 of cap headroom left.
    const capped = new AaveV3Venue(
      view,
      configured.collateralReserve,
      openForBorrow.debtReserve,
      configured.collateralData,
      openForBorrow.debtData,
    );

    expect(capped.getMaxBorrowAmount(MathLib.WAD, 1_000n)).toBe(500_000_000n);
  });

  // A USDC-shaped debt reserve open for borrowing under a 2000 cap: 3.4 virtual of 3.5
  // held liquidity, a 5000 aToken supply against 1500 of scaled debt, at RAY indices.
  const borrowableConfiguration = (2_000n << 80n) | (1n << 58n) | (1n << 56n) | (6n << 48n);
  const openForBorrow = new AaveV3Venue(
    view,
    venue.collateralReserve,
    { ...venue.debtReserve, configuration: borrowableConfiguration },
    undefined,
    {
      price: 10n ** 8n,
      aTokenScaledTotalSupply: 5_000_000_000n,
      vTokenScaledTotalSupply: 1_500_000_000n,
      underlyingBalance: 3_500_000_000n,
      virtualUnderlyingBalance: 3_400_000_000n,
    },
  );

  test("should bound the borrow capacity by the cap's scaled-debt headroom", () => {
    // The cap's 500 headroom beats the 3400 virtual liquidity and the 5000 supply.
    expect(openForBorrow.getMaxBorrowCapacity(1_000n)).toBe(500_000_000n);
    // One year in (borrow index ~1.2213 RAY), the ceil-checked headroom shrinks.
    expect(openForBorrow.getMaxBorrowCapacity(1_000n + SECONDS_PER_YEAR)).toBe(167_999_999n);
  });

  test("should bound the borrow capacity by the available liquidity without a cap", () => {
    const uncapped = new AaveV3Venue(
      view,
      venue.collateralReserve,
      { ...openForBorrow.debtReserve, configuration: (1n << 58n) | (1n << 56n) | (6n << 48n) },
      undefined,
      openForBorrow.debtData,
    );

    expect(uncapped.getMaxBorrowCapacity(1_000n)).toBe(3_400_000_000n);
  });

  test("should return zero borrow capacity when the reserve is not borrowable", () => {
    // Paused; and a 1000 cap already outgrown by the 1500 scaled debt.
    expect(
      new AaveV3Venue(
        view,
        venue.collateralReserve,
        { ...openForBorrow.debtReserve, configuration: borrowableConfiguration | (1n << 60n) },
        undefined,
        openForBorrow.debtData,
      ).getMaxBorrowCapacity(1_000n),
    ).toBe(0n);
    expect(
      new AaveV3Venue(
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

  // A WETH-shaped collateral reserve under a 1000 supply cap: 900 scaled aTokens, 100
  // scaled debt at a 20% borrow rate feeding a 10% reserve factor, at RAY indices.
  const suppliableConfiguration = (1_000n << 116n) | (1_000n << 64n) | (1n << 56n) | (18n << 48n);
  const openForSupply = new AaveV3Venue(
    view,
    {
      ...venue.collateralReserve,
      configuration: suppliableConfiguration,
      currentVariableBorrowRate: MathLib.RAY / 5n,
    },
    venue.debtReserve,
    {
      price: 0n,
      aTokenScaledTotalSupply: 900n * MathLib.WAD,
      vTokenScaledTotalSupply: 100n * MathLib.WAD,
    },
  );

  test("should bound the supply capacity by the cap's scaled-supply headroom", () => {
    // 1000 cap over 900 scaled at a RAY index: 100 whole tokens of headroom.
    expect(openForSupply.getMaxSupplyCapacity(1_000n)).toBe(100n * MathLib.WAD);
    // One year in (liquidity 1.1 RAY), the treasury's pending mint eats into the
    // headroom the grown index leaves.
    expect(openForSupply.getMaxSupplyCapacity(1_000n + SECONDS_PER_YEAR)).toBe(
      7_786_666_666_666_666_668n,
    );
  });

  test("should fold the treasury's pending mint when re-anchoring the reserves", () => {
    // The re-anchored reserve carries the treasury mint the direct projection counts, so
    // both paths agree on the remaining headroom.
    expect(openForSupply.accrueInterest(1_000n + SECONDS_PER_YEAR).getMaxSupplyCapacity()).toBe(
      openForSupply.getMaxSupplyCapacity(1_000n + SECONDS_PER_YEAR),
    );
  });

  test("should floor the treasury's debt accrual on the index delta", () => {
    // 3 wei of scaled debt compounding 50% over a year under a 100% reserve factor and a
    // 10-token cap at 0 decimals: flooring the scaled-supply × index-delta product
    // accrues 1 wei to the treasury (per-balance ceil readings would say 2), leaving 4
    // of the cap's 10 over the 5 supplied.
    const flooring = new AaveV3Venue(
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
      { price: 0n, aTokenScaledTotalSupply: 5n, vTokenScaledTotalSupply: 3n },
    );

    expect(flooring.getMaxSupplyCapacity(1_000n + SECONDS_PER_YEAR)).toBe(4n);
  });

  test("should return unlimited supply capacity without a cap and zero when frozen", () => {
    expect(
      new AaveV3Venue(
        view,
        { ...openForSupply.collateralReserve, configuration: (1n << 56n) | (18n << 48n) },
        venue.debtReserve,
        openForSupply.collateralData,
      ).getMaxSupplyCapacity(1_000n),
    ).toBe(MathLib.MAX_UINT_256);
    expect(
      new AaveV3Venue(
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

import { describe, expect, test } from "vitest";
import { ORACLE_PRICE_SCALE } from "../../constants.js";
import { MathLib } from "../../math/index.js";
import { Venue } from "./Venue.js";

/** Concrete stub: the base class only stores the live view. */
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

describe("Venue", () => {
  test("stores all fields", () => {
    const venue = new TestVenue({
      id: 1n,
      data: "0x",
      pod: "0x0000000000000000000000000000000000000001",
      collateral: 10n * MathLib.WAD,
      debt: 5n * MathLib.WAD,
      collateralIndex: MathLib.RAY,
      debtIndex: 2n * MathLib.RAY,
      lltv: 500_000_000_000_000_000n,
      price: ORACLE_PRICE_SCALE,
      lastUpdate: 1_000n,
    });

    expect(venue.id).toBe(1n);
    expect(venue.pod).toBe("0x0000000000000000000000000000000000000001");
    expect(venue.collateral).toBe(10n * MathLib.WAD);
    expect(venue.debt).toBe(5n * MathLib.WAD);
    expect(venue.collateralIndex).toBe(MathLib.RAY);
    expect(venue.debtIndex).toBe(2n * MathLib.RAY);
    expect(venue.lltv).toBe(500_000_000_000_000_000n);
    expect(venue.price).toBe(ORACLE_PRICE_SCALE);
    expect(venue.lastUpdate).toBe(1_000n);
  });

  test("keeps an unknown price undefined", () => {
    const venue = new TestVenue({
      id: 1n,
      data: "0x",
      pod: "0x0000000000000000000000000000000000000001",
      collateral: 0n,
      debt: 0n,
      collateralIndex: MathLib.RAY,
      debtIndex: MathLib.RAY,
      lltv: MathLib.WAD,
      lastUpdate: 0n,
    });

    expect(venue.price).toBeUndefined();
  });

  test("should check health against the lltv limit of the collateral value", () => {
    const venue = new TestVenue({
      id: 1n,
      data: "0x",
      pod: "0x0000000000000000000000000000000000000001",
      collateral: 10n * MathLib.WAD,
      debt: 5n * MathLib.WAD,
      collateralIndex: MathLib.RAY,
      debtIndex: MathLib.RAY,
      lltv: 500_000_000_000_000_000n,
      price: ORACLE_PRICE_SCALE,
      lastUpdate: 1_000n,
    });

    // maxDebt = 10 * 0.5 = 5.
    expect(venue.isHealthy).toBe(true);
    expect(new TestVenue({ ...venue, debt: 5n * MathLib.WAD + 1n }).isHealthy).toBe(false);
    expect(new TestVenue({ ...venue, price: undefined }).isHealthy).toBeUndefined();
  });

  test("should return the price at which the debt meets the lltv limit", () => {
    const venue = new TestVenue({
      id: 1n,
      data: "0x",
      pod: "0x0000000000000000000000000000000000000001",
      collateral: 10n * MathLib.WAD,
      debt: 4n * MathLib.WAD,
      collateralIndex: MathLib.RAY,
      debtIndex: MathLib.RAY,
      lltv: 500_000_000_000_000_000n,
      price: ORACLE_PRICE_SCALE,
      lastUpdate: 1_000n,
    });

    // Collateral power = 10 * 0.5 = 5: liquidation at 4 / 5 of the price scale.
    expect(venue.liquidationPrice).toBe((ORACLE_PRICE_SCALE / 5n) * 4n);
    expect(new TestVenue({ ...venue, debt: 0n }).liquidationPrice).toBeNull();
    expect(new TestVenue({ ...venue, collateral: 0n }).liquidationPrice).toBe(MathLib.MAX_UINT_256);
  });

  test("should return the variation to the liquidation price", () => {
    const venue = new TestVenue({
      id: 1n,
      data: "0x",
      pod: "0x0000000000000000000000000000000000000001",
      collateral: 10n * MathLib.WAD,
      debt: 4n * MathLib.WAD,
      collateralIndex: MathLib.RAY,
      debtIndex: MathLib.RAY,
      lltv: 500_000_000_000_000_000n,
      price: ORACLE_PRICE_SCALE,
      lastUpdate: 1_000n,
    });

    // Liquidation price 0.8 under a current price of 1: a 20% drop.
    expect(venue.priceVariationToLiquidationPrice).toBe(-200_000_000_000_000_000n);
    expect(
      new TestVenue({ ...venue, price: undefined }).priceVariationToLiquidationPrice,
    ).toBeUndefined();
    expect(new TestVenue({ ...venue, price: 0n }).priceVariationToLiquidationPrice).toBeNull();
    expect(new TestVenue({ ...venue, debt: 0n }).priceVariationToLiquidationPrice).toBeNull();
  });

  test("should return the lltv limit of the collateral value over the debt", () => {
    const venue = new TestVenue({
      id: 1n,
      data: "0x",
      pod: "0x0000000000000000000000000000000000000001",
      collateral: 10n * MathLib.WAD,
      debt: 4n * MathLib.WAD,
      collateralIndex: MathLib.RAY,
      debtIndex: MathLib.RAY,
      lltv: 500_000_000_000_000_000n,
      price: ORACLE_PRICE_SCALE,
      lastUpdate: 1_000n,
    });

    // maxDebt = 10 * 0.5 = 5 over a debt of 4.
    expect(venue.healthFactor).toBe(1_250_000_000_000_000_000n);
    expect(new TestVenue({ ...venue, debt: 0n }).healthFactor).toBe(MathLib.MAX_UINT_256);
    expect(new TestVenue({ ...venue, price: undefined }).healthFactor).toBeUndefined();
  });
});

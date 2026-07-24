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
}

describe("Venue", () => {
  test("stores all fields", () => {
    const venue = new TestVenue({
      pod: "0x0000000000000000000000000000000000000001",
      collateral: 10n * MathLib.WAD,
      debt: 5n * MathLib.WAD,
      collateralIndex: MathLib.RAY,
      debtIndex: 2n * MathLib.RAY,
      lltv: 500_000_000_000_000_000n,
      price: ORACLE_PRICE_SCALE,
      lastUpdate: 1_000n,
    });

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
});

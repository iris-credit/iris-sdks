import { describe, expect, test } from "vitest";
import { SECONDS_PER_YEAR } from "../../constants.js";
import { MathLib } from "../../math/index.js";
import { AaveV3Venue } from "./AaveV3Venue.js";

describe("AaveV3Venue", () => {
  const venue = new AaveV3Venue({
    collateralReserve: {
      index: MathLib.RAY,
      rate: MathLib.RAY / 10n,
      lastUpdateTimestamp: 1_000n,
    },
    debtReserve: {
      index: MathLib.RAY,
      rate: MathLib.RAY / 5n,
      lastUpdateTimestamp: 1_000n,
    },
  });

  test("should return the stored indices at or before the reserves' last update", () => {
    expect(venue.indices(1_000n)).toEqual({
      collateralIndex: MathLib.RAY,
      debtIndex: MathLib.RAY,
    });
    expect(venue.indices(500n)).toEqual({
      collateralIndex: MathLib.RAY,
      debtIndex: MathLib.RAY,
    });
  });

  test("should project the collateral index linearly", () => {
    // 10% over exactly one year on a RAY index.
    expect(venue.indices(1_000n + SECONDS_PER_YEAR).collateralIndex).toBe(
      MathLib.RAY + MathLib.RAY / 10n,
    );
  });

  test("should project the debt index with compounding", () => {
    const { debtIndex } = venue.indices(1_000n + SECONDS_PER_YEAR);

    // Compounded 20% over a year: above the linear 1.2 RAY.
    expect(debtIndex).toBeGreaterThan(MathLib.RAY + MathLib.RAY / 5n);
  });
});

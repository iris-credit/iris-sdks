import { describe, expect, test } from "vitest";
import { ReserveConfigurationLib } from "./ReserveConfigurationLib.js";

describe("ReserveConfigurationLib", () => {
  // WBTC-shaped word: ltv 73%, liquidation threshold 78%, decimals 8, active and
  // borrowable, 10% reserve factor, borrow cap 1000, supply cap 3000.
  const configuration =
    (3_000n << 116n) |
    (1_000n << 80n) |
    (1_000n << 64n) |
    (1n << 58n) |
    (1n << 56n) |
    (8n << 48n) |
    (7_800n << 16n) |
    7_300n;

  test("should decode the max LTV from bits 0-15", () => {
    expect(ReserveConfigurationLib.getLtv(configuration)).toBe(7_300n);
  });

  test("should decode the decimals from bits 48-55", () => {
    expect(ReserveConfigurationLib.getDecimals(configuration)).toBe(8n);
  });

  test("should decode the flags from bits 56-60", () => {
    expect(ReserveConfigurationLib.getFlags(configuration)).toStrictEqual({
      isActive: true,
      isFrozen: false,
      borrowingEnabled: true,
      isPaused: false,
    });
    expect(
      ReserveConfigurationLib.getFlags(configuration | (1n << 57n) | (1n << 60n)),
    ).toStrictEqual({
      isActive: true,
      isFrozen: true,
      borrowingEnabled: true,
      isPaused: true,
    });
  });

  test("should decode the reserve factor from bits 64-79", () => {
    expect(ReserveConfigurationLib.getReserveFactor(configuration)).toBe(1_000n);
  });

  test("should decode the caps from bits 80-151 in whole tokens", () => {
    expect(ReserveConfigurationLib.getBorrowCap(configuration)).toBe(1_000n);
    expect(ReserveConfigurationLib.getSupplyCap(configuration)).toBe(3_000n);
  });
});

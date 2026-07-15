import { describe, expect, test } from "vitest";
import { MathLib } from "../../math/index.js";
import { BlmUtils } from "./BlmUtils.js";

const { WAD } = MathLib;

describe("BlmUtils", () => {
  describe("bondRequirement", () => {
    test("should floor slope * duration / 1 days", () => {
      // 1 * 86_399 / 86_400 floors to 0, leaving only the intercept.
      expect(
        BlmUtils.bondRequirement({ slope: 1n, intercept: 5n }, { debt: WAD, duration: 86_399n }),
      ).toBe(5n);

      // 999_999_999_999_999_999 * 86_401 = 86_400_999_999_999_999_913_599, which
      // divided by 86_400 floors to 1_000_011_574_074_074_073 (remainder 6_399).
      expect(
        BlmUtils.bondRequirement(
          { slope: 999_999_999_999_999_999n, intercept: 0n },
          { debt: WAD, duration: 86_401n },
        ),
      ).toBe(1_000_011_574_074_074_073n);
    });

    test("should floor debt * ratio / WAD", () => {
      // 100 * 333_333_333_333_333_333 / 1e18 = 33.33… floors to 33.
      expect(
        BlmUtils.bondRequirement(
          { slope: 0n, intercept: 333_333_333_333_333_333n },
          { debt: 100n, duration: 86_400n },
        ),
      ).toBe(33n);
    });

    test("should charge the intercept share of the debt with a zero slope", () => {
      // ratio = 0.5 WAD regardless of the duration.
      expect(
        BlmUtils.bondRequirement(
          { slope: 0n, intercept: 500_000_000_000_000_000n },
          { debt: 1_000_000_000n, duration: 63_072_000n },
        ),
      ).toBe(500_000_000n);
      expect(
        BlmUtils.bondRequirement(
          { slope: 0n, intercept: 500_000_000_000_000_000n },
          { debt: 1_000_000_000n, duration: 0n },
        ),
      ).toBe(500_000_000n);
    });

    test("should charge the duration-scaled slope share of the debt with a zero intercept", () => {
      // 0.01 WAD per day over 30 days = 0.3 WAD (exact division).
      expect(
        BlmUtils.bondRequirement(
          { slope: 10_000_000_000_000_000n, intercept: 0n },
          { debt: 1_000_000_000n, duration: 2_592_000n },
        ),
      ).toBe(300_000_000n);
    });

    test("should not cap the requirement at the debt when the ratio exceeds WAD", () => {
      // Max params over MAX_DURATION (730 days): ratio =
      // 999_999_999_999_999_999 * 730 + 999_999_999_999_999_999 ≈ 731 WAD.
      expect(
        BlmUtils.bondRequirement(
          { slope: 999_999_999_999_999_999n, intercept: 999_999_999_999_999_999n },
          { debt: WAD, duration: 63_072_000n },
        ),
      ).toBe(730_999_999_999_999_999_269n);
    });

    test("should require no bond for a zero debt", () => {
      expect(
        BlmUtils.bondRequirement(
          { slope: 999_999_999_999_999_999n, intercept: 999_999_999_999_999_999n },
          { debt: 0n, duration: 63_072_000n },
        ),
      ).toBe(0n);
    });
  });

  describe("isWhitelisted", () => {
    const alice = "0x0000000000000000000000000000000000000001";
    const bob = "0x0000000000000000000000000000000000000002";

    test("should pass every account with an empty whitelist", () => {
      expect(BlmUtils.isWhitelisted({ whitelist: [] }, alice)).toBe(true);
    });

    test("should pass a whitelisted account", () => {
      expect(BlmUtils.isWhitelisted({ whitelist: [alice, bob] }, bob)).toBe(true);
    });

    test("should reject a non-whitelisted account", () => {
      expect(BlmUtils.isWhitelisted({ whitelist: [alice] }, bob)).toBe(false);
    });

    test("should match entries case-insensitively", () => {
      const usdc = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

      expect(BlmUtils.isWhitelisted({ whitelist: [usdc] }, usdc.toLowerCase() as typeof usdc)).toBe(
        true,
      );
    });
  });
});

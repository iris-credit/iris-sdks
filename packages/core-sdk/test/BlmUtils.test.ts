import { describe, expect, test } from "vitest";
import { BlmUtils, MathLib } from "../src/index.js";

const { WAD } = MathLib;

describe("BlmUtils", () => {
  describe("bondRequirement", () => {
    test("should floor slope * duration / 1 days", () => {
      // 1 * 86_399 / 86_400 floors to 0, leaving only the intercept.
      expect(
        BlmUtils.bondRequirement({ debt: WAD, duration: 86_399n }, { slope: 1n, intercept: 5n }),
      ).toBe(5n);

      // 999_999_999_999_999_999 * 86_401 = 86_400_999_999_999_999_913_599, which
      // divided by 86_400 floors to 1_000_011_574_074_074_073 (remainder 6_399).
      expect(
        BlmUtils.bondRequirement(
          { debt: WAD, duration: 86_401n },
          { slope: 999_999_999_999_999_999n, intercept: 0n },
        ),
      ).toBe(1_000_011_574_074_074_073n);
    });

    test("should floor debt * ratio / WAD", () => {
      // 100 * 333_333_333_333_333_333 / 1e18 = 33.33… floors to 33.
      expect(
        BlmUtils.bondRequirement(
          { debt: 100n, duration: 86_400n },
          { slope: 0n, intercept: 333_333_333_333_333_333n },
        ),
      ).toBe(33n);
    });

    test("should charge the intercept share of the debt with a zero slope", () => {
      // ratio = 0.5 WAD regardless of the duration.
      expect(
        BlmUtils.bondRequirement(
          { debt: 1_000_000_000n, duration: 63_072_000n },
          { slope: 0n, intercept: 500_000_000_000_000_000n },
        ),
      ).toBe(500_000_000n);
      expect(
        BlmUtils.bondRequirement(
          { debt: 1_000_000_000n, duration: 0n },
          { slope: 0n, intercept: 500_000_000_000_000_000n },
        ),
      ).toBe(500_000_000n);
    });

    test("should charge the duration-scaled slope share of the debt with a zero intercept", () => {
      // 0.01 WAD per day over 30 days = 0.3 WAD (exact division).
      expect(
        BlmUtils.bondRequirement(
          { debt: 1_000_000_000n, duration: 2_592_000n },
          { slope: 10_000_000_000_000_000n, intercept: 0n },
        ),
      ).toBe(300_000_000n);
    });

    test("should not cap the requirement at the debt when the ratio exceeds WAD", () => {
      // Max params over MAX_DURATION (730 days): ratio =
      // 999_999_999_999_999_999 * 730 + 999_999_999_999_999_999 ≈ 731 WAD.
      expect(
        BlmUtils.bondRequirement(
          { debt: WAD, duration: 63_072_000n },
          { slope: 999_999_999_999_999_999n, intercept: 999_999_999_999_999_999n },
        ),
      ).toBe(730_999_999_999_999_999_269n);
    });

    test("should require no bond for a zero debt", () => {
      expect(
        BlmUtils.bondRequirement(
          { debt: 0n, duration: 63_072_000n },
          { slope: 999_999_999_999_999_999n, intercept: 999_999_999_999_999_999n },
        ),
      ).toBe(0n);
    });
  });
});

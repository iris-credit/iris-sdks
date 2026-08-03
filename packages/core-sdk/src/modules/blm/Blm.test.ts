import { describe, expect, test } from "vitest";
import { IrisCoreErrors } from "../../errors.js";
import { MathLib } from "../../math/index.js";
import { Blm } from "./Blm.js";

const blm = new Blm({
  address: "0x0000000000000000000000000000000000000001",
  token: "0x0000000000000000000000000000000000000002",
  slope: 10_000_000_000_000_000n,
  intercept: 5_000_000_000_000_000n,
});

describe("Blm", () => {
  describe("bondRequirement", () => {
    test("should compute the bond requirement", () => {
      // ratio = 0.01 WAD/day * 30 days + 0.005 WAD; bond = 1_000e6 * ratio.
      expect(blm.bondRequirement({ debt: 1_000_000_000n, duration: 2_592_000n })).toBe(
        305_000_000n,
      );
    });

    test("should throw on an unconfigured token", () => {
      const unconfigured = new Blm({ ...blm, slope: 0n, intercept: 0n });

      expect(() =>
        unconfigured.bondRequirement({ debt: MathLib.WAD, duration: 2_592_000n }),
      ).toThrow(IrisCoreErrors.ZeroBondRequirement);
    });

    test("should throw on a dust debt rounding to a zero requirement", () => {
      // ratio = 0.305 WAD < WAD, so a 1-wei debt floors to 0.
      expect(() => blm.bondRequirement({ debt: 1n, duration: 2_592_000n })).toThrow(
        IrisCoreErrors.ZeroBondRequirement,
      );
    });
  });
});

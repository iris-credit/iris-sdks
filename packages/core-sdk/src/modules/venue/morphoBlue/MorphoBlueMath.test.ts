import { describe, expect, test } from "vitest";
import { MathLib } from "../../../math/index.js";
import { MorphoBlueMath } from "./MorphoBlueMath.js";

describe("MorphoBlueMath", () => {
  describe("wTaylorCompounded", () => {
    test("should return zero growth for zero elapsed time", () => {
      expect(MorphoBlueMath.wTaylorCompounded(MathLib.WAD, 0n)).toBe(0n);
    });

    test("should match the third-order Taylor expansion", () => {
      // rate × elapsed = WAD: 1 + 1/2 + 1/6 (third-order e - 1).
      expect(MorphoBlueMath.wTaylorCompounded(MathLib.WAD, 1n)).toBe(1_666_666_666_666_666_666n);
    });
  });
});

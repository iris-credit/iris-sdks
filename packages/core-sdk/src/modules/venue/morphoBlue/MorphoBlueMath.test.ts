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

  describe("toSharesDown", () => {
    test("should price the assets against the market's shares", () => {
      // The whole borrow converts to the whole share supply.
      expect(MorphoBlueMath.toSharesDown(MathLib.WAD, MathLib.WAD, MathLib.WAD * 1_000_000n)).toBe(
        MathLib.WAD * 1_000_000n,
      );
      // Half the borrow burns half the shares.
      expect(
        MorphoBlueMath.toSharesDown(MathLib.WAD / 2n, MathLib.WAD, MathLib.WAD * 1_000_000n),
      ).toBe((MathLib.WAD * 1_000_000n) / 2n);
    });

    test("should round down where toSharesUp rounds up", () => {
      // Accrued interest leaves the market above one asset per share, so 1 wei is worth
      // less than a share: repaying burns none, borrowing mints one.
      expect(MorphoBlueMath.toSharesDown(1n, MathLib.WAD * 2n, MathLib.WAD)).toBe(0n);
      expect(MorphoBlueMath.toSharesUp(1n, MathLib.WAD * 2n, MathLib.WAD)).toBe(1n);
    });

    test("should price against the virtual offsets on an empty market", () => {
      // VIRTUAL_SHARES per VIRTUAL_ASSET on a market with nothing borrowed.
      expect(MorphoBlueMath.toSharesDown(MathLib.WAD, 0n, 0n)).toBe(
        MathLib.WAD * MorphoBlueMath.VIRTUAL_SHARES,
      );
    });
  });
});

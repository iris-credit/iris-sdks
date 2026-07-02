import type { BigIntish } from "../../types.js";

import { Time } from "@iris-credit/iris-ts";
import { MathLib } from "../../math/index.js";

export namespace BlmUtils {
  /**
   * Bit-exact mirror of `Blm.bondRequirement` / `WhitelistBlm.bondRequirement` (both share the
   * formula). The ratio can exceed WAD, so the required bond can exceed the debt.
   *
   * @param quote.debt Principal, in debt token units.
   * @param quote.duration Duration, in seconds.
   * @param params.slope WAD-scaled slope for the quote's debt token.
   * @param params.intercept WAD-scaled intercept for the quote's debt token.
   * @returns Required bond, in debt token units.
   */
  export const bondRequirement = (
    { debt, duration }: { debt: BigIntish; duration: BigIntish },
    { slope, intercept }: { slope: BigIntish; intercept: BigIntish },
  ) => {
    const ratio = MathLib.mulDivDown(slope, duration, Time.s.from.d(1n)) + BigInt(intercept);

    return MathLib.mulDivDown(debt, ratio, MathLib.WAD);
  };
}

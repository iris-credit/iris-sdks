import type { Address } from "viem";
import type { BigIntish } from "../../types.js";

import { isAddressEqual } from "viem";
import { Time } from "@iris-credit/iris-ts";
import { MathLib } from "../../math/index.js";

export namespace BlmUtils {
  /**
   * Bit-exact mirror of `Blm.bondRequirement` / `WhitelistBlm.bondRequirement` (both share the
   * formula). The ratio can exceed WAD, so the required bond can exceed the debt.
   *
   * @param params.slope WAD-scaled slope for the quote's debt token.
   * @param params.intercept WAD-scaled intercept for the quote's debt token.
   * @param quote.debt Principal, in debt token units.
   * @param quote.duration Duration, in seconds.
   * @returns Required bond, in debt token units.
   */
  export const bondRequirement = (
    { slope, intercept }: { slope: BigIntish; intercept: BigIntish },
    { debt, duration }: { debt: BigIntish; duration: BigIntish },
  ) => {
    const ratio = MathLib.mulDivDown(slope, duration, Time.s.from.d(1n)) + BigInt(intercept);

    return MathLib.mulDivDown(debt, ratio, MathLib.WAD);
  };

  /**
   * Whether `account` passes a BLM's whitelist, matching entries case-insensitively.
   *
   * An empty whitelist means the BLM has no whitelist gate (plain flavor), so every account
   * passes. NB: a whitelist-flavor BLM with a genuinely empty list is indistinguishable from
   * that; `fetchIsWhitelisted` is the authoritative onchain check.
   *
   * @param params.whitelist Whitelisted accounts, or empty when the BLM has no whitelist.
   * @param account Account to check (e.g. `quote.solver`).
   * @returns Whether `account` passes the whitelist.
   */
  export const isWhitelisted = (
    { whitelist }: { whitelist: readonly Address[] },
    account: Address,
  ) => {
    if (whitelist.length === 0) return true;

    return whitelist.some((entry) => isAddressEqual(entry, account));
  };
}

import type { Address } from "viem";
import type { BigIntish } from "../../types.js";

import { IrisCoreErrors } from "../../errors.js";
import { BlmUtils } from "./BlmUtils.js";

/** Plain input shape for a BLM's per-token state. */
export interface IBlm {
  address: Address;
  token: Address;
  slope: bigint;
  intercept: bigint;
  whitelist?: readonly Address[];
}

/**
 * Represents a BLM's bond parameters for one debt token.
 */
export class Blm implements IBlm {
  /**
   * The BLM's address.
   */
  public readonly address: Address;
  /**
   * The debt token the parameters apply to.
   */
  public readonly token: Address;
  /**
   * The bond ratio growth per day of duration (scaled by WAD).
   */
  public readonly slope: bigint;
  /**
   * The base bond ratio (scaled by WAD).
   */
  public readonly intercept: bigint;
  /**
   * Accounts whitelisted on the BLM, as provided by the caller (e.g. from the indexer); not
   * verified onchain and assignable after fetching. Empty when the BLM has no whitelist (plain
   * flavor), making `isWhitelisted` pass every account.
   */
  public whitelist: readonly Address[];

  constructor(blm: IBlm) {
    this.address = blm.address;
    this.token = blm.token;
    this.slope = blm.slope;
    this.intercept = blm.intercept;
    this.whitelist = blm.whitelist ?? [];
  }

  /**
   * The required bond for a quote of `debt` and `duration`, in debt token units.
   *
   * @param quote.debt Principal, in debt token units.
   * @param quote.duration Duration, in seconds.
   * @returns Required bond, in debt token units.
   * @throws {IrisCoreErrors.ZeroBondRequirement} When the requirement is zero (unconfigured
   * token or dust debt): such a quote is unsubmittable since `Iris.open` requires a nonzero
   * bond requirement.
   * @example
   * ```ts
   * import { Blm } from "@iris-credit/core-sdk";
   *
   * const blm = new Blm({
   *   address: "0x0000000000000000000000000000000000000001",
   *   token: "0x0000000000000000000000000000000000000002",
   *   slope: 10_000_000_000_000_000n, // 0.01 WAD per day of duration.
   *   intercept: 5_000_000_000_000_000n, // 0.005 WAD base ratio.
   * });
   *
   * // ratio = 0.01 WAD/day * 30 days + 0.005 WAD = 0.305 WAD.
   * const bond = blm.bondRequirement({ debt: 1_000_000_000n, duration: 2_592_000n });
   * // bond === 305000000n
   * ```
   */
  public bondRequirement(quote: { debt: BigIntish; duration: BigIntish }) {
    const requirement = BlmUtils.bondRequirement(this, quote);

    if (requirement === 0n) throw new IrisCoreErrors.ZeroBondRequirement(this.address, this.token);

    return requirement;
  }

  /**
   * Whether `account` passes the BLM's whitelist; `true` for every account when the whitelist
   * is empty.
   */
  public isWhitelisted(account: Address) {
    return BlmUtils.isWhitelisted(this, account);
  }
}

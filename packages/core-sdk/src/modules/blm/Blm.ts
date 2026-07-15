import type { Address } from "viem";
import type { BigIntish } from "../../types.js";

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
   */
  public bondRequirement(quote: { debt: BigIntish; duration: BigIntish }) {
    return BlmUtils.bondRequirement(this, quote);
  }

  /**
   * Whether `account` passes the BLM's whitelist; `true` for every account when the whitelist
   * is empty.
   */
  public isWhitelisted(account: Address) {
    return BlmUtils.isWhitelisted(this, account);
  }
}

import type { Address } from "viem";

/** Plain input shape for the Iris protocol configuration. */
export interface IConfig {
  fee: bigint;
  feeRecipient: Address;
}

/**
 * Represents the mutable protocol-level Iris configuration.
 */
export class Config implements IConfig {
  /**
   * The protocol fee, snapshotted into loans at `take` (scaled by WAD).
   */
  public readonly fee: bigint;
  /**
   * The recipient of accrued protocol fees.
   */
  public readonly feeRecipient: Address;

  constructor(config: IConfig) {
    this.fee = config.fee;
    this.feeRecipient = config.feeRecipient;
  }
}

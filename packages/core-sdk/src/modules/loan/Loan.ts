import type { Address } from "viem";
import type { Quote } from "../../signatures/quote.js";
import type { BigIntish } from "../../types.js";

import { LoanUtils } from "./LoanUtils.js";

/** Plain input shape for an Iris loan. */
export interface ILoan {
  borrower: Address;
  solver: Address;
  collateralToken: Address;
  debtToken: Address;
  venueBitmap: bigint;
  maturity: bigint;
  overduePeriod: bigint;
  fixedRate: bigint;
  overdueRate: bigint;
  bondLltv: bigint;
  fee: bigint;
}

/**
 * Represents an Iris loan.
 */
export class Loan implements ILoan {
  /**
   * Builds the loan terms from Quote as they are fixed at `take`.
   */
  static fromQuote(quote: Quote, { timestamp, fee }: { timestamp: BigIntish; fee: BigIntish }) {
    return new Loan({
      borrower: quote.borrower,
      solver: quote.solver,
      collateralToken: quote.collateralToken,
      debtToken: quote.debtToken,
      venueBitmap: quote.venueBitmap,
      maturity: BigInt(timestamp) + quote.duration,
      overduePeriod: quote.overduePeriod,
      fixedRate: quote.fixedRate,
      overdueRate: quote.overdueRate,
      bondLltv: quote.bondLltv,
      fee: BigInt(fee),
    });
  }

  /**
   * The user pays the fixed rate and posts the collateral.
   */
  public readonly borrower: Address;
  /**
   * The user posts the bond and earns fixedLeg − floatingLeg.
   */
  public readonly solver: Address;
  /**
   * The token supplied as collateral.
   */
  public readonly collateralToken: Address;
  /**
   * The token borrowed as debt.
   */
  public readonly debtToken: Address;
  /**
   * Allowed venues as a bitmask: bit `venueId` set means that venue is permitted.
   */
  public readonly venueBitmap: bigint;
  /**
   * The fixed-term end, as an absolute timestamp (in seconds).
   */
  public readonly maturity: bigint;
  /**
   * The grace window past maturity before liquidation opens (in seconds).
   */
  public readonly overduePeriod: bigint;
  /**
   * The annual rate the borrower pays (scaled by WAD).
   */
  public readonly fixedRate: bigint;
  /**
   * The annual surcharge added to the fixed rate past maturity (scaled by WAD).
   */
  public readonly overdueRate: bigint;
  /**
   * The bond liquidation LLTV threshold (scaled by WAD).
   */
  public readonly bondLltv: bigint;
  /**
   * The protocol fee, snapshotted from Iris config at `take` (scaled by WAD).
   */
  public readonly fee: bigint;

  constructor(loan: ILoan) {
    this.borrower = loan.borrower;
    this.solver = loan.solver;
    this.collateralToken = loan.collateralToken;
    this.debtToken = loan.debtToken;
    this.venueBitmap = loan.venueBitmap;
    this.maturity = loan.maturity;
    this.overduePeriod = loan.overduePeriod;
    this.fixedRate = loan.fixedRate;
    this.overdueRate = loan.overdueRate;
    this.bondLltv = loan.bondLltv;
    this.fee = loan.fee;
  }

  /**
   * The earliest timestamp at which this loan is liquidatable.
   */
  get liquidatableAt() {
    return LoanUtils.liquidatableAt(this);
  }

  /**
   * Whether the loan is past maturity at `timestamp`.
   */
  public isOverdue(timestamp: BigIntish) {
    return LoanUtils.isOverdue(this, timestamp);
  }

  /**
   * Whether the loan is liquidatable at `timestamp`.
   */
  public isLiquidatable(timestamp: BigIntish) {
    return LoanUtils.isLiquidatable(this, timestamp);
  }

  /** Whether `venueId` is allowed by the loan's venue bitmap. */
  public isVenueAllowed(venueId: BigIntish) {
    return LoanUtils.isVenueAllowed(this, venueId);
  }
}

import type { Address } from "viem";
import type { Quote } from "../../signatures/quote.js";
import type { BigIntish } from "../../types.js";

import { BP } from "../../constants.js";
import { LoanUtils } from "./LoanUtils.js";

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

export class Loan implements ILoan {
  /**
   * The loan a `take(quote, ...)` would create at the given timestamp, mirroring the
   * `Quote` → `Loan` storage writes of `Iris.take`. Assumes a quote satisfying `take`'s
   * requires (rates and bondLltv multiples of BP, duration within bounds, ...).
   *
   * @param quote The quote to take.
   * @param params.timestamp The `take` timestamp, in seconds (`maturity = timestamp + duration`).
   * @param params.fee The protocol fee at `take` time, in basis points as returned by `Iris.fee()`.
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
      fixedRate: quote.fixedRate / BP,
      overdueRate: quote.overdueRate / BP,
      bondLltv: quote.bondLltv / BP,
      fee: BigInt(fee),
    });
  }

  public readonly borrower: Address;

  public readonly solver: Address;

  public readonly collateralToken: Address;

  public readonly debtToken: Address;

  public readonly venueBitmap: bigint;

  public readonly maturity: bigint;

  public readonly overduePeriod: bigint;

  public readonly fixedRate: bigint;

  public readonly overdueRate: bigint;

  public readonly bondLltv: bigint;

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

  get liquidatableAt() {
    return LoanUtils.liquidatableAt(this);
  }

  get bondLiquidationIncentiveFactor() {
    return LoanUtils.bondLiquidationIncentiveFactor(this);
  }

  public isOverdue(timestamp: BigIntish) {
    return LoanUtils.isOverdue(this, timestamp);
  }

  public liquidationIncentiveFactor(timestamp: BigIntish) {
    return LoanUtils.liquidationIncentiveFactor(this, timestamp);
  }

  public isVenueAllowed(venueId: BigIntish) {
    return LoanUtils.isVenueAllowed(this, venueId);
  }
}

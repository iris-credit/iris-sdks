import type { Address, Hex } from "viem";
import type { BigIntish } from "../../types.js";
import type { ILoan } from "../loan/Loan.js";
import type { Venue } from "../venue/Venue.js";

import { IrisCoreErrors } from "../../errors.js";
import { Loan } from "../loan/Loan.js";
import { LoanUtils } from "../loan/LoanUtils.js";
import { PositionUtils } from "./PositionUtils.js";

/** Plain input shape for an Iris pod position. */
export interface IPosition {
  pod: Address;
  collateral: bigint;
  debt: bigint;
  bond: bigint;
  bondRequirement: bigint;
  collateralIndex: bigint;
  debtIndex: bigint;
  fixedLeg: bigint;
  floatingLeg: bigint;
  surplus: bigint;
  lastUpdate: bigint;
  venueId: bigint;
  data: Hex;
}

/**
 * Represents the stored state of an Iris loan's position, as of its `lastUpdate`.
 */
export class Position implements IPosition {
  /**
   * The pod holding this position (identifies the loan).
   */
  public readonly pod: Address;
  /**
   * The collateral assets supplied to the venue.
   */
  public collateral: bigint;
  /**
   * The debt (principal) borrowed from the venue.
   */
  public debt: bigint;
  /**
   * The solver's bond backing the loan.
   */
  public bond: bigint;
  /**
   * The required bond (zero once the loan is resolved).
   */
  public bondRequirement: bigint;
  /**
   * The venue's collateral index at the last update (scaled by RAY).
   */
  public collateralIndex: bigint;
  /**
   * The venue's debt index at the last update (scaled by RAY).
   */
  public debtIndex: bigint;
  /**
   * The fixed interest accrued to the last update.
   */
  public fixedLeg: bigint;
  /**
   * The floating interest accrued to the last update.
   */
  public floatingLeg: bigint;
  /**
   * The collateral yield accrued to the last update.
   */
  public surplus: bigint;
  /**
   * The timestamp of the last accrual (in seconds; zero when no loan exists).
   */
  public lastUpdate: bigint;
  /**
   * The id of the venue holding the position.
   */
  public venueId: bigint;
  /**
   * The venue-specific market data (e.g. ABI-encoded Morpho market params).
   */
  public data: Hex;

  constructor(position: IPosition) {
    this.pod = position.pod;
    this.collateral = position.collateral;
    this.debt = position.debt;
    this.bond = position.bond;
    this.bondRequirement = position.bondRequirement;
    this.collateralIndex = position.collateralIndex;
    this.debtIndex = position.debtIndex;
    this.fixedLeg = position.fixedLeg;
    this.floatingLeg = position.floatingLeg;
    this.surplus = position.surplus;
    this.lastUpdate = position.lastUpdate;
    this.venueId = position.venueId;
    this.data = position.data;
  }
}

/**
 * Represents a position paired with its loan and its venue, for derived and accrued values.
 */
export class AccrualPosition extends Position {
  protected readonly _loan: ILoan;
  protected readonly _venue: Venue;

  /**
   * @throws {IrisCoreErrors.UnexpectedPod} When the loan or the venue is of a different
   *   pod than the position.
   */
  constructor(position: IPosition, loan: ILoan, venue: Venue) {
    super(position);

    if (loan.pod !== position.pod) throw new IrisCoreErrors.UnexpectedPod(position.pod, loan.pod);
    if (venue.pod !== position.pod) throw new IrisCoreErrors.UnexpectedPod(position.pod, venue.pod);

    this._loan = new Loan(loan);
    this._venue = venue;
  }

  /**
   * The loan this position belongs to.
   */
  get loan() {
    return this._loan;
  }

  /**
   * The venue's live view of the pod.
   */
  get venue() {
    return this._venue;
  }

  /**
   * Whether the position's bond is healthy (see `PositionUtils.isHealthyBond`). Evaluated
   * on the legs as stored on this instance — accrue first for an up-to-date answer.
   */
  get isHealthyBond() {
    return PositionUtils.isHealthyBond(this, this._loan);
  }

  /**
   * The position's drawdown: the floating leg over the fixed leg, relative to the bond
   * (scaled by WAD; see `PositionUtils.getDrawdown`). Evaluated on the legs as stored on
   * this instance — accrue first for an up-to-date answer.
   */
  get drawdown() {
    return PositionUtils.getDrawdown(this);
  }

  /**
   * The maximum collateral withdrawable while keeping the loan collateralized through the
   * liquidation deadline (see `PositionUtils.getWithdrawableCollateral`), or `undefined`
   * when the venue price is unknown. Evaluated at `lastUpdate` — accrue first for an
   * up-to-date answer.
   */
  get withdrawableCollateral() {
    return PositionUtils.getWithdrawableCollateral(this, this._loan, this._venue, this.lastUpdate);
  }

  /**
   * The maximum bond withdrawable while keeping the bond healthy (see
   * `PositionUtils.getWithdrawableBond`). Evaluated on the legs as stored on this
   * instance — accrue first for an up-to-date answer.
   */
  get withdrawableBond() {
    return PositionUtils.getWithdrawableBond(this, this._loan);
  }

  /**
   * The collateral seized in exchange for repaying the loan when liquidated at
   * `lastUpdate` (zero while the loan is not liquidatable; see
   * `PositionUtils.getLiquidationSeizedCollateral`), or `undefined` when the venue price
   * is unknown. Accrue first for an up-to-date answer.
   */
  get seizableCollateral() {
    return PositionUtils.getLiquidationSeizedCollateral(
      this,
      this._loan,
      this._venue,
      this.lastUpdate,
    );
  }

  /**
   * The bond seized by the caller for triggering the bond liquidation (zero while the
   * bond is healthy; see `PositionUtils.getBondLiquidationSeizedAmount`). Evaluated on
   * the legs as stored on this instance — accrue first for an up-to-date answer.
   */
  get seizableBond() {
    return PositionUtils.getBondLiquidationSeizedAmount(this, this._loan);
  }

  /**
   * The debt assets required to repay the loan at `lastUpdate`: the fixed leg settled
   * first, as repay does onchain (see `settleLegs`), then Iris's repay charge applied
   * (see `PositionUtils.getRepayAmount`). Evaluated on the legs as stored on this
   * instance — accrue first for an up-to-date answer.
   */
  get repayAmount() {
    return PositionUtils.getRepayAmount(this.settleLegs());
  }

  /**
   * Whether the loan is past maturity at `lastUpdate` — accrue first for an up-to-date
   * answer.
   */
  get isOverdue() {
    return LoanUtils.isOverdue(this._loan, this.lastUpdate);
  }

  /**
   * Whether the loan is liquidatable at `lastUpdate` — accrue first for an up-to-date
   * answer.
   */
  get isLiquidatable() {
    return LoanUtils.isLiquidatable(this._loan, this.lastUpdate);
  }

  /**
   * The earliest timestamp at which the loan is liquidatable.
   */
  get liquidatableAt() {
    return LoanUtils.liquidatableAt(this._loan);
  }

  /**
   * The liquidation incentive factor at `lastUpdate` (scaled by WAD) — accrue first for
   * an up-to-date answer.
   */
  get lif() {
    return LoanUtils.getLif(this._loan, this.lastUpdate);
  }

  /**
   * The bond liquidation incentive factor (scaled by WAD).
   */
  get bondLif() {
    return LoanUtils.getBondLif(this._loan);
  }

  /**
   * Returns a new position with the venue projected to the given timestamp with its own
   * rate model (see `Venue.accrueInterest`) and the indices and legs accrued against the
   * projected venue, matching Iris's onchain accrual (see `PositionUtils.getAccruedLegs`).
   * The returned position carries the projected venue. Leaves this position unchanged.
   *
   * Throws when the timestamp is prior to the position's last update or a venue index is
   * prior to the stored one (both revert onchain), and when the timestamp is prior to the
   * venue's last update (no stale venue data — see `Venue.accrueInterest`).
   *
   * @param timestamp The timestamp at which to accrue interest (in seconds).
   */
  public accrueLegs(timestamp: BigIntish = this.lastUpdate) {
    timestamp = BigInt(timestamp);

    if (timestamp < this.lastUpdate) {
      throw new IrisCoreErrors.InvalidInterestAccrual(timestamp, this.lastUpdate);
    }
    const venue = this._venue.accrueInterest(timestamp);

    if (venue.collateralIndex < this.collateralIndex) {
      throw new IrisCoreErrors.InvalidVenueIndex(
        "collateral",
        venue.collateralIndex,
        this.collateralIndex,
      );
    }
    if (venue.debtIndex < this.debtIndex) {
      throw new IrisCoreErrors.InvalidVenueIndex("debt", venue.debtIndex, this.debtIndex);
    }

    const accrued = PositionUtils.getAccruedLegs(this, this._loan, venue, timestamp);

    return new AccrualPosition(
      {
        ...this,
        collateralIndex: accrued.collateralIndex,
        debtIndex: accrued.debtIndex,
        fixedLeg: this.fixedLeg + accrued.fixedLeg,
        floatingLeg: this.floatingLeg + accrued.floatingLeg,
        surplus: this.surplus + accrued.surplus,
        lastUpdate: timestamp,
      },
      this._loan,
      venue,
    );
  }

  /**
   * Returns a new position rebased against the venue's view of the pod, matching Iris's
   * onchain rebase (see `PositionUtils.getRebasedPosition`), or `undefined` when a rebase
   * is needed but the venue price is unknown. Leaves this position unchanged.
   *
   * Expects accrued legs: call `accrueLegs` beforehand, as the rebase runs after accrual
   * onchain.
   */
  public rebase() {
    const rebased = PositionUtils.getRebasedPosition(this, this._venue);
    if (rebased == null) return;

    return new AccrualPosition({ ...this, ...rebased }, this._loan, this._venue);
  }

  /**
   * Returns a new position with the fixed leg settled (the residual credited before
   * maturity), matching Iris's onchain settlement at `lastUpdate` (see
   * `PositionUtils.getResidual`). Leaves this position unchanged.
   *
   * Expects accrued legs: call `accrueLegs` beforehand, as settlement runs after accrual
   * onchain.
   */
  public settleLegs() {
    return new AccrualPosition(
      {
        ...this,
        fixedLeg: this.fixedLeg + PositionUtils.getResidual(this, this._loan, this.lastUpdate),
      },
      this._loan,
      this._venue,
    );
  }
}

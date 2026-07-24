import type { Address, Hex } from "viem";
import type { BigIntish } from "../../types.js";
import type { ILoan } from "../loan/Loan.js";
import type { Venue } from "../venue/Venue.js";

import { IrisCoreErrors } from "../../errors.js";
import { Loan } from "../loan/Loan.js";
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
   * maturity) alongside the solver's net and the protocol fee cuts, matching Iris's
   * onchain settlement at `lastUpdate` (see `PositionUtils.getSettlement`). Leaves this
   * position unchanged.
   *
   * Expects accrued legs: call `accrueLegs` beforehand, as settlement runs after accrual
   * onchain.
   */
  public settleLegs() {
    const settlement = PositionUtils.getSettlement(this, this._loan, this.lastUpdate);
    const position = new AccrualPosition(
      {
        ...this,
        fixedLeg: this.fixedLeg + PositionUtils.getResidual(this, this._loan, this.lastUpdate),
      },
      this._loan,
      this._venue,
    );

    return { position, ...settlement };
  }
}

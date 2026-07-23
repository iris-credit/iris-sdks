import type { Address, Hex } from "viem";
import type { BigIntish } from "../../types.js";
import type { ILoan } from "../loan/Loan.js";
import type { Venue } from "../venue/Venue.js";

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
   * The venue's collateral index at the last update (scaled by WAD).
   */
  public collateralIndex: bigint;
  /**
   * The venue's debt index at the last update (scaled by WAD).
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
  protected readonly _loan: Loan;
  protected readonly _venue: Venue;

  constructor(position: IPosition, loan: ILoan, venue: Venue) {
    super(position);

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
   * The venue backing this position, carrying the rate model that projects its indices.
   */
  get venue() {
    return this._venue;
  }

  /**
   * Whether the position's bond is healthy (see {@link PositionUtils.isHealthyBond}).
   * Evaluated on the legs as stored on this instance — accrue first for an up-to-date answer.
   */
  get isHealthyBond() {
    return PositionUtils.isHealthyBond(this, this._loan);
  }

  /**
   * Returns a new position derived from this position, whose legs have been accrued up to the
   * given timestamp: the fixed (and overdue) leg from the loan's rates, the floating leg and
   * surplus from the venue's indices projected to `timestamp` with its rate model
   * (see {@link Venue.indices}).
   *
   * Projections assume the venue's current rates persist, so values at future timestamps are
   * first-order estimates — fund flows derived from them with a small buffer
   * (see {@link getRepaid}).
   *
   * The venue is carried over unchanged on purpose: it is the projection's calibration
   * snapshot, not a time-anchored view, so re-anchoring it would add no information while
   * making chained accruals path-dependent (Taylor compounding is not exactly multiplicative).
   *
   * A never-created position (`lastUpdate === 0n`) is returned unchanged.
   *
   * @param timestamp - The timestamp at which to accrue interest (in seconds). Must be greater
   *   than or equal to the position's `lastUpdate`.
   * @throws {IrisCoreErrors.InvalidInterestAccrual} when `timestamp` is prior to `lastUpdate`.
   * @throws {IrisCoreErrors.InvalidVenueIndex} when the venue's projected indices regress below
   *   the position's stored indices (e.g. a venue snapshot older than the position's state).
   */
  public accrueInterest(timestamp: BigIntish): AccrualPosition {
    timestamp = BigInt(timestamp);

    const indices = this._venue.indices(timestamp);

    const { collateralIndex, debtIndex, fixedLeg, floatingLeg, surplus } =
      PositionUtils.getAccruedLegs(
        this,
        this._loan,
        indices.collateralIndex,
        indices.debtIndex,
        timestamp,
      );

    return new AccrualPosition(
      {
        ...this,
        collateralIndex,
        debtIndex,
        fixedLeg: this.fixedLeg + fixedLeg,
        floatingLeg: this.floatingLeg + floatingLeg,
        surplus: this.surplus + surplus,
        lastUpdate: this.lastUpdate === 0n ? 0n : timestamp,
      },
      this._loan,
      this._venue,
    );
  }

  /**
   * Returns the debt-token assets pulled from the payer when the position is repaid at the
   * given timestamp: accrues the legs to `timestamp`, then applies Iris's settlement math
   * (see {@link PositionUtils.getRepaid}).
   *
   * The onchain amount can still drift from this projection until execution (venue rates
   * moving with utilization), so fund a repayment with a small buffer on top of this value.
   *
   * @param timestamp - The repayment timestamp (in seconds).
   * @throws {IrisCoreErrors.InvalidInterestAccrual} when `timestamp` is prior to `lastUpdate`.
   * @throws {IrisCoreErrors.InvalidVenueIndex} when the venue's projected indices regress below
   *   the position's stored indices (e.g. a venue snapshot older than the position's state).
   */
  public getRepaid(timestamp: BigIntish): bigint {
    timestamp = BigInt(timestamp);

    return PositionUtils.getRepaid(this.accrueInterest(timestamp), this._loan, timestamp);
  }
}

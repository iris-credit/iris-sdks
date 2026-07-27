import type { Address, Hex } from "viem";
import type { BigIntish } from "../../types.js";
import type { ILoan } from "../loan/Loan.js";
import type { Venue } from "../venue/Venue.js";

import { IrisCoreErrors } from "../../errors.js";
import { MathLib } from "../../math/index.js";
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
  protected readonly _loan: Loan;
  protected readonly _venue: Venue;

  /**
   * @throws {IrisCoreErrors.UnexpectedPod} When the loan or the venue is of a different
   *   pod than the position.
   * @throws {IrisCoreErrors.UnexpectedVenue} When the venue is not the one the position
   *   is held on — its indices, rate model and constraints would silently be the wrong
   *   ones.
   */
  constructor(position: IPosition, loan: ILoan, venue: Venue) {
    super(position);

    if (loan.pod !== position.pod) throw new IrisCoreErrors.UnexpectedPod(position.pod, loan.pod);
    if (venue.pod !== position.pod) throw new IrisCoreErrors.UnexpectedPod(position.pod, venue.pod);
    if (venue.id !== position.venueId || venue.data !== position.data) {
      throw new IrisCoreErrors.UnexpectedVenue(
        position.venueId,
        venue.id,
        position.data,
        venue.data,
      );
    }

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
   * Whether the position is healthy: the worst-case payoff through the liquidation
   * deadline within the venue LLTV limit of the collateral's value (see
   * `PositionUtils.isHealthy`), or `undefined` when the venue price is unknown. Evaluated
   * at `lastUpdate` — accrue first for an up-to-date answer.
   */
  get isHealthy() {
    return PositionUtils.isHealthy(this, this._loan, this._venue, this.lastUpdate);
  }

  /**
   * Whether the pod's position is healthy on the venue itself: the venue debt within the
   * venue LLTV limit of the venue collateral's value (see `Venue.isHealthy`), or
   * `undefined` when the venue price is unknown. Evaluated on the venue's live view —
   * accrue first for an up-to-date answer.
   */
  get isHealthyVenue() {
    return this._venue.isHealthy;
  }

  /**
   * Whether the position's bond is healthy (see `PositionUtils.isHealthyBond`). Evaluated
   * on the legs as stored on this instance — accrue first for an up-to-date answer.
   */
  get isHealthyBond() {
    return PositionUtils.isHealthyBond(this, this._loan);
  }

  /**
   * The collateral price quoted in debt assets below which the venue can liquidate the
   * pod's position (see `Venue.liquidationPrice`), or `null` when the pod has no venue
   * debt. Evaluated on the venue's live view — accrue first for an up-to-date answer.
   */
  get liquidationPrice() {
    return this._venue.liquidationPrice;
  }

  /**
   * The price variation required for the pod's position to reach its liquidation price
   * (scaled by WAD): negative when healthy (the price needs to drop x%), positive when
   * unhealthy (the price needs to soar x%; see `Venue.priceVariationToLiquidationPrice`).
   * `undefined` when the venue price is unknown; `null` on a zero price or when the pod
   * has no venue debt. Evaluated on the venue's live view — accrue first for an
   * up-to-date answer.
   */
  get priceVariationToLiquidationPrice() {
    return this._venue.priceVariationToLiquidationPrice;
  }

  /**
   * The health factor of the pod's position on the venue: the venue's LLTV limit of the
   * collateral's value over the venue debt (scaled by WAD; `MathLib.MAX_UINT_256` when
   * the pod has no venue debt; see `Venue.healthFactor`), or `undefined` when the venue
   * price is unknown. Evaluated on the venue's live view — accrue first for an
   * up-to-date answer.
   */
  get healthFactor() {
    return this._venue.healthFactor;
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
   * liquidation deadline and the pod's venue position healthy (see
   * `PositionUtils.getWithdrawableCollateral`), or `undefined` when the venue price is
   * unknown. Evaluated at `lastUpdate` — accrue first for an up-to-date answer.
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
    return this._loan.isOverdue(this.lastUpdate);
  }

  /**
   * Whether the loan is liquidatable at `lastUpdate` — accrue first for an up-to-date
   * answer.
   */
  get isLiquidatable() {
    return this._loan.isLiquidatable(this.lastUpdate);
  }

  /**
   * The earliest timestamp at which the loan is liquidatable.
   */
  get liquidatableAt() {
    return this._loan.liquidatableAt;
  }

  /**
   * The liquidation incentive factor at `lastUpdate` (scaled by WAD) — accrue first for
   * an up-to-date answer.
   */
  get lif() {
    return this._loan.getLif(this.lastUpdate);
  }

  /**
   * The bond liquidation incentive factor (scaled by WAD).
   */
  get bondLif() {
    return this._loan.bondLif;
  }

  /**
   * Whether the loan's venue bitmap allows the given venue (see
   * `LoanUtils.isVenueAllowed`).
   *
   * @param venueId The venue id to check.
   */
  public isVenueAllowed(venueId: BigIntish) {
    return this._loan.isVenueAllowed(venueId);
  }

  /**
   * Returns a new position with the venue projected to the given timestamp with its own
   * rate model (see `Venue.accrueInterest`) and the indices and legs accrued against the
   * projected venue, matching Iris's onchain accrual (see `PositionUtils.getAccruedLegs`).
   * The returned position carries the projected venue.
   *
   * Throws when the timestamp is prior to the position's last update or a venue index is
   * prior to the stored one (both revert onchain), and when the timestamp is prior to the
   * venue's last update (no stale venue data — see `Venue.accrueInterest`).
   *
   * @param timestamp The timestamp at which to accrue interest (in seconds). Defaults to
   *   `lastUpdate`.
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
   * onchain rebase (see `PositionUtils.getRebasedPosition`).
   *
   * Expects accrued legs: call `accrueLegs` beforehand, as the rebase runs after accrual
   * onchain.
   *
   * @throws {IrisCoreErrors.UnknownVenuePrice} When the venue price is unknown.
   */
  public rebase() {
    if (this.venue.price == null) {
      throw new IrisCoreErrors.UnknownVenuePrice(this.pod, this.venueId);
    }

    const rebased = PositionUtils.getRebasedPosition(this, this._venue)!;

    return new AccrualPosition({ ...this, ...rebased }, this._loan, this._venue);
  }

  /**
   * Returns a new position with the fixed leg settled (the residual credited before
   * maturity), matching Iris's onchain settlement at `lastUpdate` (see
   * `PositionUtils.getResidual`).
   *
   * Expects accrued legs: call `accrueLegs` beforehand, as settlement runs after accrual
   * onchain.
   *
   * @dev Kept internal because settlement is not idempotent: the residual is derived from
   * the debt and the time to maturity, which settling does not change, so a second call
   * credits it twice. `repay` and `liquidate` settle exactly once, and `repayAmount`
   * settles a copy.
   */
  protected settleLegs() {
    return new AccrualPosition(
      {
        ...this,
        fixedLeg: this.fixedLeg + PositionUtils.getResidual(this, this._loan, this.lastUpdate),
      },
      this._loan,
      this._venue,
    );
  }

  /**
   * Returns a new position with the loan repaid — the legs accrued to `timestamp`, rebased
   * and settled, then the bond slashed by the solver's negative net and the debt, legs and
   * surplus cleared, resolving the loan — alongside the debt assets pulled from the payer,
   * matching Iris's `repay` (see `PositionUtils.getRepayAmount`).
   *
   * The venue is repaid in full and the surplus withdrawn from it, but keeps the
   * borrower's collateral: Iris leaves it on the venue for the pod.
   *
   * @param timestamp The repayment timestamp (in seconds). Defaults to `lastUpdate`.
   * @throws {IrisCoreErrors.UnknownVenuePrice} When the venue price is unknown.
   */
  public repay(timestamp?: BigIntish) {
    if (this.venue.price == null) {
      throw new IrisCoreErrors.UnknownVenuePrice(this.pod, this.venueId);
    }

    const position = this.accrueLegs(timestamp).rebase().settleLegs();
    const repaid = PositionUtils.getRepayAmount(position);
    const bondSlashed = MathLib.min(
      MathLib.zeroFloorSub(position.floatingLeg, position.fixedLeg),
      position.bond,
    );
    const venue = position.venue
      .repay(position.venue.debt, timestamp)
      .withdrawCollateral(position.surplus, timestamp);

    position.debt = 0n;
    position.bond -= bondSlashed;
    position.bondRequirement = 0n;
    position.fixedLeg = 0n;
    position.floatingLeg = 0n;
    position.surplus = 0n;

    return { position: new AccrualPosition(position, position._loan, venue), repaid };
  }

  /**
   * Returns a new position with the loan liquidated — the legs accrued to `timestamp`,
   * rebased and settled, then the seized collateral removed, the bond slashed by the
   * solver's negative net and the debt, legs and surplus cleared, resolving the loan —
   * alongside the debt assets pulled from the liquidator and the collateral seized in
   * exchange, matching Iris's `liquidate` (see
   * `PositionUtils.getLiquidationSeizedCollateral`).
   *
   * The venue is repaid in full, and the seized collateral withdrawn from it alongside
   * the surplus (capped at the venue's collateral).
   *
   * @param timestamp The liquidation timestamp (in seconds). Defaults to `lastUpdate`.
   * @throws {IrisCoreErrors.UnknownVenuePrice} When the venue price is unknown.
   * @throws {IrisCoreErrors.HealthyLoan} When the loan is not liquidatable once accrued.
   */
  public liquidate(timestamp?: BigIntish) {
    if (this.venue.price == null) {
      throw new IrisCoreErrors.UnknownVenuePrice(this.pod, this.venueId);
    }

    const position = this.accrueLegs(timestamp).rebase().settleLegs();

    if (!position.isLiquidatable) throw new IrisCoreErrors.HealthyLoan(position.pod);

    const repaid = PositionUtils.getRepayAmount(position);
    const seized = PositionUtils.getLiquidationSeizedCollateral(
      position,
      position._loan,
      position._venue,
      position.lastUpdate,
    )!;
    const bondSlashed = MathLib.min(
      MathLib.zeroFloorSub(position.floatingLeg, position.fixedLeg),
      position.bond,
    );
    const venue = position.venue
      .repay(position.venue.debt, timestamp)
      .withdrawCollateral(
        MathLib.min(seized + position.surplus, position.venue.collateral),
        timestamp,
      );

    position.collateral -= seized;
    position.debt = 0n;
    position.bond -= bondSlashed;
    position.bondRequirement = 0n;
    position.fixedLeg = 0n;
    position.floatingLeg = 0n;
    position.surplus = 0n;

    return { position: new AccrualPosition(position, position._loan, venue), repaid, seized };
  }

  /**
   * Returns a new position with the collateral supplied, matching Iris's
   * `supplyCollateral`: the legs are accrued to `timestamp` and rebased, and the supply
   * is applied on the venue too (see `Venue.supplyCollateral`).
   *
   * @param amount The collateral amount to supply.
   * @param timestamp The supply timestamp (in seconds). Defaults to `lastUpdate`.
   * @throws {IrisCoreErrors.UnknownVenuePrice} When the venue price is unknown.
   */
  public supplyCollateral(amount: bigint, timestamp?: BigIntish) {
    if (this.venue.price == null) {
      throw new IrisCoreErrors.UnknownVenuePrice(this.pod, this.venueId);
    }

    const position = this.accrueLegs(timestamp).rebase();
    const venue = position.venue.supplyCollateral(amount, timestamp);

    position.collateral += amount;

    return new AccrualPosition(position, position._loan, venue);
  }

  /**
   * Returns a new position with the collateral withdrawn, matching Iris's
   * `withdrawCollateral`: the legs are accrued to `timestamp` and rebased, the withdrawal
   * is applied on the venue too (see `Venue.withdrawCollateral`), and it must keep the
   * position healthy through the liquidation deadline (see `PositionUtils.isHealthy`).
   *
   * @param amount The collateral amount to withdraw.
   * @param timestamp The withdrawal timestamp (in seconds). Defaults to `lastUpdate`.
   * @throws {IrisCoreErrors.UnknownVenuePrice} When the venue price is unknown.
   * @throws {IrisCoreErrors.InsufficientVenueCollateral} When the withdrawal would leave
   *   the venue position unhealthy (see `Venue.withdrawCollateral`).
   * @throws {IrisCoreErrors.InsufficientCollateral} When the withdrawal would leave the
   *   position unhealthy.
   */
  public withdrawCollateral(amount: bigint, timestamp?: BigIntish) {
    if (this.venue.price == null) {
      throw new IrisCoreErrors.UnknownVenuePrice(this.pod, this.venueId);
    }

    const position = this.accrueLegs(timestamp).rebase();
    const venue = position.venue.withdrawCollateral(amount, timestamp);

    position.collateral -= amount;

    if (position.collateral < 0n || !position.isHealthy) {
      throw new IrisCoreErrors.InsufficientCollateral(position.pod);
    }

    return new AccrualPosition(position, position._loan, venue);
  }

  /**
   * Returns a new position with the bond topped up, matching Iris's `supplyBond` (which
   * accrues nothing onchain). The top-up is also applied in place on this position.
   *
   * @param amount The bond amount to supply.
   */
  public supplyBond(amount: bigint) {
    this.bond += amount;

    return new AccrualPosition(this, this._loan, this._venue);
  }

  /**
   * Returns a new position with the bond withdrawn, matching Iris's `withdrawBond`: the
   * legs are accrued to `timestamp` and rebased, and the withdrawal must keep the bond
   * healthy (see `PositionUtils.getWithdrawableBond`).
   *
   * @param amount The bond amount to withdraw.
   * @param timestamp The withdrawal timestamp (in seconds). Defaults to `lastUpdate`.
   * @throws {IrisCoreErrors.UnknownVenuePrice} When the venue price is unknown.
   * @throws {IrisCoreErrors.InsufficientBond} When the withdrawal exceeds the bond or
   *   leaves it unhealthy.
   */
  public withdrawBond(amount: bigint, timestamp?: BigIntish) {
    if (this.venue.price == null) {
      throw new IrisCoreErrors.UnknownVenuePrice(this.pod, this.venueId);
    }

    const position = this.accrueLegs(timestamp).rebase();

    position.bond -= amount;

    if (position.bond < 0n || !position.isHealthyBond) {
      throw new IrisCoreErrors.InsufficientBond(position.pod);
    }

    return position;
  }

  /**
   * Returns a new position with the bond liquidated — the legs accrued to `timestamp` and
   * rebased, then the bond slashed by the negative net plus the seized incentive and the
   * position cleared, resolving the loan — alongside the bond assets seized by the caller
   * and the debt assets repaid to the venue, matching Iris's `liquidateBond` (bond
   * liquidation does not settle; see `PositionUtils.getBondLiquidationSeizedAmount`).
   *
   * The returned venue is repaid alongside the position, but keeps its collateral: Iris
   * stops tracking the pod's collateral without withdrawing it from the venue.
   *
   * @param timestamp The liquidation timestamp (in seconds). Defaults to `lastUpdate`.
   * @throws {IrisCoreErrors.UnknownVenuePrice} When the venue price is unknown.
   * @throws {IrisCoreErrors.HealthyBond} When the bond is healthy once accrued.
   */
  public liquidateBond(timestamp?: BigIntish) {
    if (this.venue.price == null) {
      throw new IrisCoreErrors.UnknownVenuePrice(this.pod, this.venueId);
    }

    const position = this.accrueLegs(timestamp).rebase();
    const seized = PositionUtils.getBondLiquidationSeizedAmount(position, position._loan);
    const bondSlashed = MathLib.min(
      MathLib.zeroFloorSub(position.floatingLeg, position.fixedLeg) + seized,
      position.bond,
    );
    // The slashed bond beyond the liquidator's cut repays the pod's venue debt.
    const repaid = MathLib.min(bondSlashed - seized, position.venue.debt);

    if (position.isHealthyBond) throw new IrisCoreErrors.HealthyBond(position.pod);

    const venue = position.venue.repay(repaid, timestamp);

    position.collateral = 0n;
    position.debt = 0n;
    position.bond -= bondSlashed;
    position.bondRequirement = 0n;
    position.fixedLeg = 0n;
    position.floatingLeg = 0n;
    position.surplus = 0n;

    return { position: new AccrualPosition(position, position._loan, venue), seized, repaid };
  }

  /**
   * Returns a new position migrated to the given venue, matching Iris's `refinance`: the
   * legs are accrued to `timestamp` and rebased, the pod's assets are moved onto the new
   * venue, and the position re-anchors on the new venue's indices, id and data. The
   * tracked collateral and debt are unchanged — only the index basis moves.
   *
   * The new venue is expected as fetched for the pod, i.e. holding no assets on it yet.
   *
   * @param venue The venue to migrate to.
   * @param timestamp The refinancing timestamp (in seconds). Defaults to `lastUpdate`.
   * @throws {IrisCoreErrors.UnknownVenuePrice} When the current venue price is unknown.
   * @throws {IrisCoreErrors.LoanResolved} When the loan is already resolved.
   * @throws {IrisCoreErrors.NotAllowedVenue} When the loan's venue bitmap disallows the
   *   venue.
   * @throws {IrisCoreErrors.InsufficientVenueCollateral} When the venue cannot support the
   *   migrated position, which Iris rejects when entering it.
   */
  public refinance(venue: Venue, timestamp?: BigIntish) {
    if (this.venue.price == null) {
      throw new IrisCoreErrors.UnknownVenuePrice(this.pod, this.venueId);
    }
    if (this.bondRequirement === 0n) throw new IrisCoreErrors.LoanResolved(this.pod);
    if (!this._loan.isVenueAllowed(venue.id)) {
      throw new IrisCoreErrors.NotAllowedVenue(this.pod, venue.id);
    }

    const position = this.accrueLegs(timestamp).rebase();
    // The pod exits its old venue entirely and enters the new one with the same assets.
    const migrated = venue
      .supplyCollateral(position.venue.collateral, timestamp)
      .borrow(position.venue.debt, timestamp);

    if (migrated.price == null) {
      throw new IrisCoreErrors.UnknownVenuePrice(migrated.pod, migrated.id);
    }
    // Entering the venue reverts onchain when its LLTV or price can't carry the debt.
    if (!migrated.isHealthy) {
      throw new IrisCoreErrors.InsufficientVenueCollateral(migrated.pod, migrated.id);
    }

    return new AccrualPosition(
      {
        ...position,
        collateralIndex: migrated.collateralIndex,
        debtIndex: migrated.debtIndex,
        venueId: migrated.id,
        data: migrated.data,
      },
      position._loan,
      migrated,
    );
  }
}

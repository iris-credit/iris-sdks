import type { Address, Hex } from "viem";
import type {
  AccrualPosition,
  BigIntish,
  ChainId,
  FetchParameters,
  Loan,
  Quote,
  Venue,
} from "@iris-credit/core-sdk";
import type { IrisClientType } from "../types/client.js";
import type {
  AuthorizationRequirementSignature,
  DepositAmountArgs,
  ERC20ApprovalAction,
  IrisAuthorizationAction,
  IrisClaimAction,
  IrisEscapeAction,
  IrisRefinanceAction,
  IrisRepayAction,
  IrisSupplyBondAction,
  IrisSupplyCollateralAction,
  IrisTakeAction,
  IrisWithdrawBondAction,
  IrisWithdrawCollateralAction,
  PermitRequirementSignature,
  Requirement,
  RequirementSignature,
  SolverPermit2,
  Transaction,
} from "../types/index.js";

import { isAddressEqual, zeroAddress } from "viem";
import {
  BP,
  fetchAccrualPosition,
  fetchClaimable,
  fetchLoan,
  fetchVenue,
  IrisCoreErrors,
  MathLib,
  MAX_DURATION,
  MAX_FIXED_RATE,
  MAX_OVERDUE_PERIOD,
  MAX_OVERDUE_RATE,
  MIN_DURATION,
  PositionUtils,
} from "@iris-credit/core-sdk";
import { Time } from "@iris-credit/iris-ts";
import { irisClaim } from "../actions/iris/claim.js";
import { irisEscape } from "../actions/iris/escape.js";
import { irisRefinance } from "../actions/iris/refinance.js";
import { irisRepay } from "../actions/iris/repay.js";
import { irisSupplyBond } from "../actions/iris/supplyBond.js";
import { irisSupplyCollateral } from "../actions/iris/supplyCollateral.js";
import { irisTake } from "../actions/iris/take.js";
import { irisWithdrawBond } from "../actions/iris/withdrawBond.js";
import { irisWithdrawCollateral } from "../actions/iris/withdrawCollateral.js";
import { getGeneralAdapterRequirements } from "../actions/requirements/generalAdapter/getGeneralAdapterRequirements.js";
import { getIrisAuthorizationRequirement } from "../actions/requirements/iris/getIrisAuthorizationRequirement.js";
import {
  DEFAULT_LLTV_BUFFER,
  validateChainId,
  validateNativeAsset,
  validateUserAddress,
} from "../helpers/index.js";
import {
  ClaimExceedsClaimableError,
  LoanNotCreatedError,
  LoanNotResolvedError,
  LoanResolvedError,
  NativeAmountExceedsCollateralError,
  NegativeInputError,
  NonPositiveInputError,
  NotAllowedVenueError,
  NotMultipleOfBpError,
  QuoteExpiredError,
  QuoteOutOfBoundsError,
  selectRequirementSignatures,
  SolverPermit2AmountBelowBondError,
  SolverPermit2AssetMismatchError,
  SolverPermit2ExpiredError,
  UnhealthyBondError,
  UnhealthyCollateralError,
  ZeroAddressError,
} from "../types/index.js";

/** Flow methods exposed by the chain-scoped Iris entity. */
export interface IrisActions {
  /**
   * Fetches the pod's loan — its parties, tokens and terms — in a single read.
   *
   * @param pod - Pod identifying the loan.
   * @param parameters - Optional fetch parameters (block number, state overrides).
   * @returns The hydrated `Loan`, the `loanData` the supply flows take.
   */
  getLoanData: (pod: Address, parameters?: FetchParameters) => Promise<Loan>;

  /**
   * Fetches the pod's position with its loan and venue, ready for accrual math.
   *
   * Reads the whole venue state, so prefer `getLoanData` for flows that only need the loan; a
   * caller holding an `AccrualPosition` can hand its `loan` to those flows instead of re-fetching.
   *
   * @param pod - Pod identifying the loan.
   * @param parameters - Optional fetch parameters (block number, state overrides).
   * @returns The hydrated `AccrualPosition`.
   */
  getPositionData: (pod: Address, parameters?: FetchParameters) => Promise<AccrualPosition>;

  /**
   * Fetches a venue's live view of the pod — its assets, indices, LLTV and price.
   *
   * Reads the venue as it stands for the pod, so a venue the pod has not entered comes back
   * holding nothing: the shape `refinance` expects of its target venue.
   *
   * @param params - Venue identification parameters.
   * @param parameters - Optional fetch parameters (block number, state overrides).
   * @returns The hydrated `Venue`, the `newVenue` the refinance flow takes.
   */
  getVenueData: (
    params: { loanData: Loan; venueId: BigIntish; data: Hex },
    parameters?: FetchParameters,
  ) => Promise<Venue>;

  /**
   * Fetches the balance an account can claim from Iris for one token.
   *
   * @param account - Account owning the claimable balance.
   * @param token - Token the balance is denominated in.
   * @param parameters - Optional fetch parameters (block number, state overrides).
   * @returns The claimable balance, the `claimableData` the claim flow takes.
   */
  getClaimableData: (
    account: Address,
    token: Address,
    parameters?: FetchParameters,
  ) => Promise<bigint>;

  /**
   * Prepares a take transaction opening an Iris loan from a solver-signed quote.
   *
   * Validation is local-only — the pure subset of `Iris.take`'s requires (deadline, non-zero
   * addresses and amounts, rate / duration bounds, BP-multiple rates, venue bitmap,
   * `solverPermit2` consistency, and native-amount bounds). On-chain guarantees the RFQ already validated at quote time (solver
   * signature, enabled configuration, bond requirement) are not re-read here; the contract
   * re-verifies everything at execution.
   *
   * `getRequirements` resolves what must be in place before the bundle executes:
   *
   * - The collateral-token approval `Transaction` or permit / Permit2 signature `Requirement`
   *   for `GeneralAdapter1`, funded by `userAddress`; pass `useSimplePermit: true` to prefer an
   *   EIP-2612 permit when the token supports it.
   * - The Iris authorization for `GeneralAdapter1` on behalf of `quote.borrower` — `Iris.take`
   *   requires its bundled caller (the adapter) to be authorized by the borrower. Returned as a
   *   `setAuthorization` transaction, or as a signable `Requirement` when the client opts into
   *   `supportSignature`; omitted when the borrower already authorized the adapter. `userAddress`
   *   must equal `quote.borrower` — the borrower funds the collateral and signs the authorization
   *   with the connected client; `take` rejects a mismatch.
   *
   * @param params - Take parameters.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  take: (params: {
    userAddress: Address;
    quote: Quote;
    quoteSignature: Hex;
    solverPermit2?: SolverPermit2;
    nativeAmount?: bigint;
  }) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<IrisTakeAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<
      (
        | Readonly<Transaction<ERC20ApprovalAction>>
        | Requirement<PermitRequirementSignature>
        | Readonly<Transaction<IrisAuthorizationAction>>
        | Requirement<AuthorizationRequirementSignature>
      )[]
    >;
  };

  /**
   * Prepares a repay transaction closing an existing Iris loan.
   *
   * Takes the pre-fetched `positionData` for the pod — the amount owed is derived from the
   * accrued legs and the venue, which the loan alone does not carry — and sizes the funding from
   * it. Iris repays in full at a price that accrues per second, so the bundle funds an upper
   * bound and sweeps back what the repayment left over.
   *
   * Because the repayment is permissionless, `getRequirements` resolves only the debt-token
   * approval `Transaction` / permit / Permit2 signature `Requirement` for `GeneralAdapter1`,
   * funded by `userAddress` — no Iris authorization.
   *
   * @param params - Repay parameters.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  repay: (params: {
    userAddress: Address;
    positionData: AccrualPosition;
    nativeAmount?: bigint;
  }) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<IrisRepayAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<
      (Readonly<Transaction<ERC20ApprovalAction>> | Requirement<PermitRequirementSignature>)[]
    >;
  };

  /**
   * Prepares a supply-collateral transaction topping up an existing Iris loan's collateral.
   *
   * Takes the pre-fetched `loanData` for the pod and supplies its collateral token.
   * Because the supply is permissionless, `getRequirements` resolves only the collateral-token
   * approval `Transaction` / permit / Permit2 signature `Requirement` for `GeneralAdapter1`,
   * funded by `userAddress` — no Iris authorization.
   *
   * @param params - Supply-collateral parameters.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  supplyCollateral: (params: { userAddress: Address; loanData: Loan } & DepositAmountArgs) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<IrisSupplyCollateralAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<
      (Readonly<Transaction<ERC20ApprovalAction>> | Requirement<PermitRequirementSignature>)[]
    >;
  };

  /**
   * Prepares a withdraw-collateral transaction withdrawing from an existing Iris loan's collateral.
   *
   * Takes the pre-fetched `positionData` for the pod — the health Iris re-checks is derived from
   * the accrued legs and the venue's price and LLTV, so the loan alone does not carry it — and
   * validates that the remaining collateral clears both Iris's check and the venue's own, which
   * Iris's does not imply.
   *
   * The ceilings are measured on `positionData` as given, so accrue and rebase it (see
   * `AccrualPosition.accrueLegs` / `rebase`) to the timestamp the withdrawal targets.
   *
   * Direct call to `Iris.withdrawCollateral`, withdrawing to `userAddress`. The caller
   * (`msg.sender`) must be the loan's borrower or be authorized by them on Iris. Reach for the
   * `irisWithdrawCollateral` action directly to send the collateral somewhere other than
   * `userAddress`.
   *
   * No `getRequirements` — no token approval or Iris authorization is needed (the collateral
   * flows out of the venue, not in).
   *
   * @param params - Withdraw-collateral parameters.
   * @returns Object with `buildTx`.
   */
  withdrawCollateral: (params: {
    userAddress: Address;
    positionData: AccrualPosition;
    amount: bigint;
  }) => {
    buildTx: () => Readonly<Transaction<IrisWithdrawCollateralAction>>;
  };

  /**
   * Prepares a supply-bond transaction topping up an existing Iris loan's solver bond.
   *
   * Takes the pre-fetched `loanData` for the pod and supplies its debt token — the
   * asset the bond is denominated in. Because the supply is permissionless, `getRequirements`
   * resolves only the debt-token approval `Transaction` / permit / Permit2 signature
   * `Requirement` for `GeneralAdapter1`, funded by `userAddress` — no Iris authorization.
   *
   * @param params - Supply-bond parameters.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  supplyBond: (params: { userAddress: Address; loanData: Loan } & DepositAmountArgs) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<IrisSupplyBondAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<
      (Readonly<Transaction<ERC20ApprovalAction>> | Requirement<PermitRequirementSignature>)[]
    >;
  };

  /**
   * Prepares a withdraw-bond transaction withdrawing from an existing Iris loan's solver bond.
   *
   * Takes the pre-fetched `positionData` for the pod — the bond health Iris re-checks is derived
   * from the accrued legs, so the loan alone does not carry it — and validates that the remaining
   * bond stays healthy, using a buffer below the loan's bond LLTV.
   *
   * Direct call to `Iris.withdrawBond`, withdrawing to `userAddress`. The caller (`msg.sender`)
   * must be the loan's solver or be authorized by them on Iris. Reach for the `irisWithdrawBond`
   * action directly to send the bond somewhere other than `userAddress`.
   *
   * No `getRequirements` — no token approval or Iris authorization is needed (the bond flows out
   * of Iris, not in).
   *
   * @param params - Withdraw-bond parameters.
   * @returns Object with `buildTx`.
   */
  withdrawBond: (params: {
    userAddress: Address;
    positionData: AccrualPosition;
    amount: bigint;
  }) => {
    buildTx: () => Readonly<Transaction<IrisWithdrawBondAction>>;
  };

  /**
   * Prepares a claim transaction drawing down `userAddress`'s claimable Iris balance.
   *
   * Takes the pre-fetched `claimableData` for the account and token — from
   * {@link Iris.getClaimableData} — and validates the claim against it, so an oversized claim
   * surfaces as a typed error instead of the bare arithmetic underflow `Iris.claim` reverts with.
   * `amount` defaults to the whole balance: `Iris.claim` debits an exact amount with no max-sweep
   * sentinel, so claiming everything is otherwise a manual round-trip through the same value.
   *
   * Direct call to `Iris.claim`, claiming to `userAddress`. The caller (`msg.sender`) must be
   * `userAddress` or be authorized by them on Iris. Reach for the `irisClaim` action directly to
   * claim on another account's behalf or to send the tokens elsewhere.
   *
   * No `getRequirements` — no token approval or Iris authorization is needed (the tokens flow out
   * of Iris, not in).
   *
   * @param params - Claim parameters.
   * @returns Object with `buildTx`.
   */
  claim: (params: {
    userAddress: Address;
    token: Address;
    claimableData: bigint;
    amount?: bigint;
  }) => {
    buildTx: () => Readonly<Transaction<IrisClaimAction>>;
  };

  /**
   * Prepares an escape transaction exiting the venue position of a resolved Iris loan.
   *
   * Takes the pre-fetched `positionData` for the pod — escape covers the pod's live venue debt,
   * which the loan alone does not carry — and withdraws the venue collateral, yield included, to
   * `userAddress`. Reach for the `irisEscape` action directly to send it somewhere else.
   *
   * `getRequirements` resolves what must be in place before the bundle executes:
   *
   * - The debt-token approval `Transaction` or permit / Permit2 signature `Requirement` for
   *   `GeneralAdapter1`, covering the venue debt the escape settles. Empty when the venue carries
   *   none — the usual state, since repay and liquidation repay the venue in full.
   * - The Iris authorization for `GeneralAdapter1` on behalf of the borrower — `Iris.escape`
   *   requires its bundled caller (the adapter) to be authorized by the borrower. Omitted when the
   *   borrower already authorized the adapter, which a bundled `take` does.
   *
   * @param params - Escape parameters.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  escape: (params: {
    userAddress: Address;
    positionData: AccrualPosition;
    nativeAmount?: bigint;
  }) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<IrisEscapeAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<
      (
        | Readonly<Transaction<ERC20ApprovalAction>>
        | Requirement<PermitRequirementSignature>
        | Readonly<Transaction<IrisAuthorizationAction>>
        | Requirement<AuthorizationRequirementSignature>
      )[]
    >;
  };

  /**
   * Prepares a refinance transaction moving an existing Iris loan's position to another venue.
   *
   * Takes the pre-fetched `positionData` for the pod and the `newVenue` to move it to, and funds
   * the debt the pod owes its current venue — Iris clears it out of `GeneralAdapter1`'s balance
   * before the new venue is entered, so the funding cannot come from the refinance itself. The
   * new venue's borrow proceeds and the skimmed residual both return to `userAddress`, leaving it
   * whole; reach for the `irisRefinance` action directly to send the proceeds elsewhere.
   *
   * `getRequirements` resolves what must be in place before the bundle executes:
   *
   * - The debt-token approval `Transaction` or permit / Permit2 signature `Requirement` for
   *   `GeneralAdapter1`, funded by `userAddress`; pass `useSimplePermit: true` to prefer an
   *   EIP-2612 permit when the token supports it.
   * - The Iris authorization for `GeneralAdapter1` on behalf of the loan's solver — both
   *   `Iris.refinance` and the adapter require it. Returned as a `setAuthorization` transaction,
   *   or as a signable `Requirement` when the client opts into `supportSignature`; omitted when
   *   the solver already authorized the adapter. `userAddress` must be the loan's solver.
   *
   * @param params - Refinance parameters.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  refinance: (params: {
    userAddress: Address;
    positionData: AccrualPosition;
    newVenue: Venue;
    nativeAmount?: bigint;
  }) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<IrisRefinanceAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<
      (
        | Readonly<Transaction<ERC20ApprovalAction>>
        | Requirement<PermitRequirementSignature>
        | Readonly<Transaction<IrisAuthorizationAction>>
        | Requirement<AuthorizationRequirementSignature>
      )[]
    >;
  };
}

/** Chain-scoped Iris entity: validates flows and returns lazy transaction handles. */
export class Iris implements IrisActions {
  constructor(
    private readonly client: IrisClientType,
    private readonly chainId: ChainId,
  ) {}

  /**
   * Fetches the pod's loan — its parties, tokens and terms — in a single read.
   *
   * @param pod - Pod identifying the loan.
   * @param parameters - Optional fetch parameters (block number, state overrides).
   * @returns The hydrated `Loan`.
   * @throws {ChainIdMismatchError} when the client's chain differs from the entity's chain.
   * @throws {UnsupportedChainIdError} from `fetchLoan` when the chain is not supported.
   */
  async getLoanData(pod: Address, parameters?: FetchParameters) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    return fetchLoan(pod, this.client.viemClient, { ...parameters, chainId: this.chainId });
  }

  /**
   * Fetches the pod's position with its loan and venue, ready for accrual math.
   *
   * Reads the whole venue state, so prefer {@link Iris.getLoanData} for flows that only need the
   * loan; a caller holding an `AccrualPosition` can hand its `loan` to those flows instead.
   *
   * @param pod - Pod identifying the loan.
   * @param parameters - Optional fetch parameters (block number, state overrides).
   * @returns The hydrated `AccrualPosition`.
   * @throws {ChainIdMismatchError} when the client's chain differs from the entity's chain.
   * @throws {UnsupportedChainIdError} from `fetchAccrualPosition` when the chain is not supported.
   */
  async getPositionData(pod: Address, parameters?: FetchParameters) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    return fetchAccrualPosition(pod, this.client.viemClient, {
      ...parameters,
      chainId: this.chainId,
    });
  }

  /**
   * Fetches a venue's live view of the pod — its assets, indices, LLTV and price.
   *
   * Reads the venue as it stands for the pod, so a venue the pod has not entered comes back
   * holding nothing: the shape {@link Iris.refinance} expects of its target venue.
   *
   * @param params.loanData - Pre-fetched loan for the pod, from {@link Iris.getLoanData} or an
   *   `AccrualPosition.loan`; supplies the pod and the loan's tokens.
   * @param params.venueId - The id of the venue to read.
   * @param params.data - The venue's market data.
   * @param parameters - Optional fetch parameters (block number, state overrides).
   * @returns The hydrated `Venue`.
   * @throws {ChainIdMismatchError} when the client's chain differs from the entity's chain.
   * @throws {UnsupportedVenueAdapterError} from `fetchVenue` when no adapter is
   *   registered for `venueId` — which `Iris.refinance` rejects too — or the adapter has no
   *   offline rate model.
   */
  async getVenueData(
    { loanData, venueId, data }: { loanData: Loan; venueId: BigIntish; data: Hex },
    parameters?: FetchParameters,
  ) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    const { pod, collateralToken, debtToken } = loanData;

    return fetchVenue({ pod, venueId, data, collateralToken, debtToken }, this.client.viemClient, {
      ...parameters,
      chainId: this.chainId,
    });
  }

  /**
   * Fetches the balance an account can claim from Iris for one token.
   *
   * Settlement credits the solver's net and surplus, and the fee recipient's fees, to this balance.
   *
   * @param account - Account owning the claimable balance.
   * @param token - Token the balance is denominated in.
   * @param parameters - Optional fetch parameters (block number, state overrides).
   * @returns The claimable balance.
   * @throws {ChainIdMismatchError} when the client's chain differs from the entity's chain.
   * @throws {UnsupportedChainIdError} from `fetchClaimable` when the chain is not supported.
   */
  async getClaimableData(account: Address, token: Address, parameters?: FetchParameters) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    return fetchClaimable(account, token, this.client.viemClient, {
      ...parameters,
      chainId: this.chainId,
    });
  }

  /**
   * Prepares a take transaction opening an Iris loan from a solver-signed quote.
   *
   * Validates the quote's local shape — deadline not expired, non-zero addresses and amounts,
   * `fixedRate` / `duration` / `overdueRate` / `overduePeriod` within the protocol bounds
   * mirrored from `ConstantsLib` (rates must also be whole multiples of BP), `venueId` enabled
   * in `venueBitmap`, and the `solverPermit2` payload consistent with the quote's bond. No
   * on-chain state is read here: quotes arrive RFQ-validated, the contract re-verifies
   * everything at execution, and the only reads happen lazily in `getRequirements`.
   *
   * @param params.userAddress - Account funding the collateral (the bundle initiator); must equal
   *   `quote.borrower`.
   * @param params.quote - The solver-signed quote to take.
   * @param params.quoteSignature - The solver's EIP-712 signature over the quote.
   * @param params.solverPermit2 - Optional solver-signed Permit2 bond funding payload delivered
   *   with the quote.
   * @param params.nativeAmount - Optional collateral portion paid natively and wrapped
   *   in-bundle; the collateral token must be the chain's wNative.
   * @returns Object with `buildTx` and `getRequirements`.
   * @throws {ChainIdMismatchError} when the client's chain differs from the entity's chain.
   * @throws {AddressMismatchError} when `userAddress` is not `quote.borrower`.
   * @throws {QuoteExpiredError} when `quote.deadline` has passed.
   * @throws {ZeroAddressError} when a quote address field is the zero address.
   * @throws {NonPositiveInputError} when `quote.collateral`, `quote.debt`, or `quote.bond` is not positive.
   * @throws {NegativeInputError} when `nativeAmount` is negative.
   * @throws {NativeAmountExceedsCollateralError} when `nativeAmount` exceeds `quote.collateral`.
   * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but the collateral
   *   token is not the chain's wNative.
   * @throws {QuoteOutOfBoundsError} when a rate / duration / overdue field is out of bounds.
   * @throws {NotMultipleOfBpError} when `fixedRate` or `overdueRate` is not a multiple of BP.
   * @throws {NotAllowedVenueError} when `quote.venueId` is not set in `quote.venueBitmap`.
   * @throws {SolverPermit2AssetMismatchError} when `solverPermit2` is signed for a token other
   *   than `quote.debtToken`.
   * @throws {SolverPermit2AmountBelowBondError} when `solverPermit2` is signed for less than
   *   `quote.bond`.
   * @throws {SolverPermit2ExpiredError} when `solverPermit2` is expired.
   */
  take({
    userAddress,
    quote,
    quoteSignature,
    solverPermit2,
    nativeAmount = 0n,
  }: {
    userAddress: Address;
    quote: Quote;
    quoteSignature: Hex;
    solverPermit2?: SolverPermit2;
    nativeAmount?: bigint;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    // A single connected client signs every requirement, but the Iris authorization must come
    // from `quote.borrower`; so the take initiator must be the borrower.
    validateUserAddress(userAddress, quote.borrower);

    if (quote.deadline < Time.timestamp()) throw new QuoteExpiredError(quote.deadline);
    if (isAddressEqual(quote.borrower, zeroAddress)) throw new ZeroAddressError("borrower");
    if (isAddressEqual(quote.receiver, zeroAddress)) throw new ZeroAddressError("receiver");
    if (isAddressEqual(quote.collateralToken, zeroAddress)) {
      throw new ZeroAddressError("collateralToken");
    }
    if (isAddressEqual(quote.debtToken, zeroAddress)) throw new ZeroAddressError("debtToken");

    if (quote.collateral <= 0n) throw new NonPositiveInputError("collateral", quote.collateral);
    if (quote.debt <= 0n) throw new NonPositiveInputError("debt", quote.debt);

    if (nativeAmount < 0n) throw new NegativeInputError("nativeAmount", nativeAmount);
    if (nativeAmount > quote.collateral) {
      throw new NativeAmountExceedsCollateralError(quote.collateral, nativeAmount);
    }
    if (nativeAmount > 0n) validateNativeAsset(this.chainId, quote.collateralToken);

    if (quote.fixedRate < 0n || quote.fixedRate > MAX_FIXED_RATE) {
      throw new QuoteOutOfBoundsError("fixedRate", quote.fixedRate, 0n, MAX_FIXED_RATE);
    }

    if (quote.fixedRate % BP !== 0n) {
      throw new NotMultipleOfBpError("fixedRate", quote.fixedRate);
    }

    if (quote.duration < MIN_DURATION || quote.duration > MAX_DURATION) {
      throw new QuoteOutOfBoundsError("duration", quote.duration, MIN_DURATION, MAX_DURATION);
    }

    if (quote.overdueRate < 0n || quote.overdueRate > MAX_OVERDUE_RATE) {
      throw new QuoteOutOfBoundsError("overdueRate", quote.overdueRate, 0n, MAX_OVERDUE_RATE);
    }

    if (quote.overdueRate % BP !== 0n) {
      throw new NotMultipleOfBpError("overdueRate", quote.overdueRate);
    }

    if (quote.overduePeriod < 0n || quote.overduePeriod > MAX_OVERDUE_PERIOD) {
      throw new QuoteOutOfBoundsError("overduePeriod", quote.overduePeriod, 0n, MAX_OVERDUE_PERIOD);
    }

    if (quote.bond <= 0n) throw new NonPositiveInputError("bond", quote.bond);

    if (quote.venueId >= 256n || (quote.venueBitmap & (1n << quote.venueId)) === 0n) {
      throw new NotAllowedVenueError(quote.venueId, quote.venueBitmap);
    }

    if (solverPermit2) {
      const { details, sigDeadline } = solverPermit2.permitSingle;

      if (!isAddressEqual(details.token, quote.debtToken)) {
        throw new SolverPermit2AssetMismatchError(quote.debtToken, details.token);
      }
      if (details.amount < quote.bond) {
        throw new SolverPermit2AmountBelowBondError(quote.bond, details.amount);
      }
      if (BigInt(details.expiration) < Time.timestamp() || sigDeadline < Time.timestamp()) {
        throw new SolverPermit2ExpiredError({
          expiration: BigInt(details.expiration),
          sigDeadline,
        });
      }
    }

    return {
      getRequirements: async (params?: { useSimplePermit?: boolean }) => {
        const [erc20Requirements, authorizationRequirement] = await Promise.all([
          getGeneralAdapterRequirements(this.client.viemClient, {
            address: quote.collateralToken,
            chainId: this.chainId,
            supportSignature: this.client.options.supportSignature,
            args: { amount: quote.collateral - nativeAmount, from: userAddress },
            useSimplePermit: params?.useSimplePermit,
          }),
          getIrisAuthorizationRequirement({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            userAddress: quote.borrower,
            supportSignature: this.client.options.supportSignature,
          }),
        ]);

        return [
          ...erc20Requirements,
          ...(authorizationRequirement ? [authorizationRequirement] : []),
        ];
      },

      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit, authorization } = selectRequirementSignatures(signatures, {
          permit: true,
          authorization: true,
        });

        return irisTake({
          chainId: this.chainId,
          args: {
            quote,
            quoteSignature,
            solverPermit2,
            nativeAmount,
            requirementSignature: permit,
            authorizationSignature: authorization,
          },
        });
      },
    };
  }

  /**
   * Prepares a repay transaction closing an existing Iris loan.
   *
   * Sizes the funding from the pre-fetched `positionData`, projected two hours forward: Iris
   * accrues `lastUpdate → execution` inside `repay` and pulls whatever the loan owes then, so
   * funding the amount owed at the fetched state would under-fund the pull and revert. The
   * bundle sweeps the leftover back to `userAddress`, and the projection doubles as the
   * transaction's validity window — rebuild it after two hours rather than sending a stale one.
   *
   * The repayment is permissionless, so `userAddress` is just the payer closing the loan — it
   * need not be the loan's borrower. It resolves the loan but leaves the collateral with the
   * position; withdraw it separately.
   *
   * @param params.userAddress - Account funding the repayment (the bundle initiator), which the
   *   leftover funding is swept back to.
   * @param params.positionData - Pre-fetched position for the pod, from
   *   {@link Iris.getPositionData}; supplies the pod, the debt token and the amount owed.
   * @param params.nativeAmount - Optional funding paid in the native token and wrapped in-bundle;
   *   the loan's debt token must be the chain's wNative. It funds the pull first and the ERC-20
   *   pull covers the remainder, so a native amount that covers the whole repayment pulls no
   *   ERC-20 and emits no approval requirement. Defaults to `0n`.
   * @returns Object with `buildTx` and `getRequirements`.
   * @throws {ChainIdMismatchError} when the client's chain differs from the entity's chain.
   * @throws {NegativeInputError} when `nativeAmount` is negative.
   * @throws {LoanNotCreatedError} when the pod carries no Iris loan.
   * @throws {LoanResolvedError} when the loan is already resolved, leaving nothing to repay.
   * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but the loan's debt
   *   token is not the chain's wNative.
   * @throws {IrisCoreErrors.UnknownVenuePrice} from `AccrualPosition.repay` when the venue price
   */
  repay({
    userAddress,
    positionData,
    nativeAmount = 0n,
  }: {
    userAddress: Address;
    positionData: AccrualPosition;
    nativeAmount?: bigint;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    if (nativeAmount < 0n) throw new NegativeInputError("nativeAmount", nativeAmount);

    const { pod, debt, fixedLeg, bondRequirement, lastUpdate, venue } = positionData;
    const { debtToken } = positionData.loan;

    if (lastUpdate === 0n) throw new LoanNotCreatedError(pod);
    if (debt + fixedLeg === 0n && bondRequirement === 0n) throw new LoanResolvedError(pod);
    if (nativeAmount > 0n) validateNativeAsset(this.chainId, debtToken);

    // Forward-accrue (2h) before sizing the funding: Iris accrues `lastUpdate → execution` inside
    // `repay`, so funding the amount owed now under-funds the pull.
    const accrualTimestamp =
      MathLib.max(Time.timestamp(), lastUpdate, venue.lastUpdate) + Time.s.from.h(2n);
    const { repaid } = positionData.repay(accrualTimestamp);
    // Native funds the pull first; the ERC-20 pulled is the remainder.
    const erc20Amount = MathLib.zeroFloorSub(repaid, nativeAmount);

    return {
      getRequirements: (params?: { useSimplePermit?: boolean }) =>
        getGeneralAdapterRequirements(this.client.viemClient, {
          address: debtToken,
          chainId: this.chainId,
          supportSignature: this.client.options.supportSignature,
          useSimplePermit: params?.useSimplePermit,
          args: { amount: erc20Amount, from: userAddress },
        }),

      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit } = selectRequirementSignatures(signatures, { permit: true });

        return irisRepay({
          chainId: this.chainId,
          args: {
            pod,
            token: debtToken,
            amount: erc20Amount,
            nativeAmount,
            receiver: userAddress,
            requirementSignature: permit,
          },
        });
      },
    };
  }

  /**
   * Prepares a supply-collateral transaction topping up an existing Iris loan's collateral.
   *
   * The supply is permissionless, so `userAddress` is just the payer funding the top-up — it need
   * not be the loan's borrower.
   *
   * @param params.userAddress - Account funding the collateral (the bundle initiator).
   * @param params.loanData - Pre-fetched loan for the pod, from {@link Iris.getLoanData} or an
   *   `AccrualPosition.loan`; supplies the pod and the collateral token.
   * @param params.amount - ERC-20 collateral to supply. At least one of `amount` or
   *   `nativeAmount` must be positive. Defaults to `0n`.
   * @param params.nativeAmount - Optional collateral paid in the native token and wrapped
   *   in-bundle; the loan's collateral token must be the chain's wNative.
   * @returns Object with `buildTx` and `getRequirements`.
   * @throws {ChainIdMismatchError} when the client's chain differs from the entity's chain.
   * @throws {NegativeInputError} when `amount` or `nativeAmount` is negative.
   * @throws {NonPositiveInputError} when `amount` and `nativeAmount` both resolve to zero.
   * @throws {LoanNotCreatedError} when the pod carries no Iris loan.
   * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but the loan's
   *   collateral token is not the chain's wNative.
   */
  supplyCollateral({
    userAddress,
    loanData,
    amount = 0n,
    nativeAmount,
  }: { userAddress: Address; loanData: Loan } & DepositAmountArgs) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    if (amount < 0n) throw new NegativeInputError("amount", amount);
    if (nativeAmount !== undefined && nativeAmount < 0n) {
      throw new NegativeInputError("nativeAmount", nativeAmount);
    }

    const totalCollateral = amount + (nativeAmount ?? 0n);
    if (totalCollateral === 0n) {
      throw new NonPositiveInputError("totalCollateral", totalCollateral);
    }

    const { pod, collateralToken } = loanData;
    if (isAddressEqual(collateralToken, zeroAddress)) throw new LoanNotCreatedError(pod);

    if (nativeAmount !== undefined && nativeAmount > 0n) {
      validateNativeAsset(this.chainId, collateralToken);
    }

    return {
      getRequirements: (params?: { useSimplePermit?: boolean }) =>
        getGeneralAdapterRequirements(this.client.viemClient, {
          address: collateralToken,
          chainId: this.chainId,
          supportSignature: this.client.options.supportSignature,
          useSimplePermit: params?.useSimplePermit,
          args: { amount, from: userAddress },
        }),

      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit } = selectRequirementSignatures(signatures, { permit: true });

        return irisSupplyCollateral({
          chainId: this.chainId,
          args: {
            pod,
            token: collateralToken,
            amount,
            nativeAmount,
            requirementSignature: permit,
          },
        });
      },
    };
  }

  /**
   * Prepares a withdraw-collateral transaction withdrawing from an existing Iris loan's collateral.
   *
   * Validates the withdrawal against the pre-fetched `positionData`: it may not exceed the
   * collateral withdrawable under both Iris's check and the venue's own (see
   * `PositionUtils.getWithdrawableCollateral`), measured against the venue's LLTV minus
   * `DEFAULT_LLTV_BUFFER` so a withdrawal sized to the fetched state still clears them once it
   * lands — and, for the venue's, so it does not land one accrual away from being liquidated
   * there.
   *
   * @param params.userAddress - The account sending the transaction and receiving the collateral;
   *   must be the loan's borrower or be authorized by them on Iris.
   * @param params.positionData - Pre-fetched position for the pod, from
   *   {@link Iris.getPositionData}, accrued and rebased by the caller to the timestamp the
   *   withdrawal targets; both ceilings are measured on it as given.
   * @param params.amount - The collateral to withdraw.
   * @returns Object with `buildTx`.
   * @throws {ChainIdMismatchError} when the client's chain differs from the entity's chain.
   * @throws {AddressMismatchError} when `userAddress` is not the loan's borrower.
   * @throws {NonPositiveInputError} when `amount` is not positive.
   * @throws {LoanNotCreatedError} when the pod carries no Iris loan.
   * @throws {IrisCoreErrors.UnknownVenuePrice} when the venue price is unknown, which leaves both
   *   ceilings underivable.
   * @throws {UnhealthyCollateralError} when `amount` would leave the position
   *   unhealthy.
   */
  withdrawCollateral({
    userAddress,
    positionData,
    amount,
  }: {
    userAddress: Address;
    positionData: AccrualPosition;
    amount: bigint;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateUserAddress(userAddress, positionData.loan.borrower);

    if (amount <= 0n) throw new NonPositiveInputError("amount", amount);

    const { pod, lastUpdate, venue } = positionData;

    if (lastUpdate === 0n) throw new LoanNotCreatedError(pod);

    const withdrawable = PositionUtils.getWithdrawableCollateral(
      positionData,
      positionData.loan,
      { ...venue, lltv: MathLib.zeroFloorSub(venue.lltv, DEFAULT_LLTV_BUFFER) },
      lastUpdate,
    );

    if (withdrawable == null) throw new IrisCoreErrors.UnknownVenuePrice(pod, venue.id);

    if (amount > withdrawable) {
      throw new UnhealthyCollateralError({
        pod,
        withdrawAmount: amount,
        withdrawable,
      });
    }

    return {
      buildTx: () =>
        irisWithdrawCollateral({
          chainId: this.chainId,
          args: { pod, amount, receiver: userAddress },
        }),
    };
  }

  /**
   * Prepares a supply-bond transaction topping up an existing Iris loan's solver bond.
   *
   * The bond is denominated in the loan's debt token. The supply is permissionless, so
   * `userAddress` is just the payer funding the top-up — it need not be the loan's solver.
   *
   * @param params.userAddress - Account funding the bond (the bundle initiator).
   * @param params.loanData - Pre-fetched loan for the pod, from {@link Iris.getLoanData} or an
   *   `AccrualPosition.loan`; supplies the pod and the debt token.
   * @param params.amount - ERC-20 bond to supply. At least one of `amount` or `nativeAmount` must
   *   be positive. Defaults to `0n`.
   * @param params.nativeAmount - Optional bond paid in the native token and wrapped in-bundle; the
   *   loan's debt token must be the chain's wNative.
   * @returns Object with `buildTx` and `getRequirements`.
   * @throws {ChainIdMismatchError} when the client's chain differs from the entity's chain.
   * @throws {NegativeInputError} when `amount` or `nativeAmount` is negative.
   * @throws {NonPositiveInputError} when `amount` and `nativeAmount` both resolve to zero.
   * @throws {LoanNotCreatedError} when the pod carries no Iris loan.
   * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but the loan's debt
   *   token is not the chain's wNative.
   */
  supplyBond({
    userAddress,
    loanData,
    amount = 0n,
    nativeAmount,
  }: { userAddress: Address; loanData: Loan } & DepositAmountArgs) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    if (amount < 0n) throw new NegativeInputError("amount", amount);
    if (nativeAmount !== undefined && nativeAmount < 0n) {
      throw new NegativeInputError("nativeAmount", nativeAmount);
    }

    const totalBond = amount + (nativeAmount ?? 0n);
    if (totalBond === 0n) throw new NonPositiveInputError("totalBond", totalBond);

    const { pod, debtToken } = loanData;
    if (isAddressEqual(debtToken, zeroAddress)) throw new LoanNotCreatedError(pod);

    if (nativeAmount !== undefined && nativeAmount > 0n) {
      validateNativeAsset(this.chainId, debtToken);
    }

    return {
      getRequirements: (params?: { useSimplePermit?: boolean }) =>
        getGeneralAdapterRequirements(this.client.viemClient, {
          address: debtToken,
          chainId: this.chainId,
          supportSignature: this.client.options.supportSignature,
          useSimplePermit: params?.useSimplePermit,
          args: { amount, from: userAddress },
        }),

      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit } = selectRequirementSignatures(signatures, { permit: true });

        return irisSupplyBond({
          chainId: this.chainId,
          args: { pod, token: debtToken, amount, nativeAmount, requirementSignature: permit },
        });
      },
    };
  }

  /**
   * Prepares a withdraw-bond transaction withdrawing from an existing Iris loan's solver bond.
   *
   * Validates the post-withdrawal bond health against the pre-fetched `positionData`: the
   * remaining bond must cover the bond requirement and the solver's negative net, the latter
   * measured against `bondLltv` minus `DEFAULT_LLTV_BUFFER` so a withdrawal sized to the
   * fetched state still clears the check Iris runs on the accrued legs.
   *
   * @param params.userAddress - The account sending the transaction and receiving the bond; must
   *   be the loan's solver or be authorized by them on Iris.
   * @param params.positionData - Pre-fetched position for the pod, from
   *   {@link Iris.getPositionData}; supplies the pod and the accrued legs.
   * @param params.amount - The bond to withdraw.
   * @returns Object with `buildTx`.
   * @throws {ChainIdMismatchError} when the client's chain differs from the entity's chain.
   * @throws {AddressMismatchError} when `userAddress` is not the loan's solver.
   * @throws {NonPositiveInputError} when `amount` is not positive.
   * @throws {LoanNotCreatedError} when the pod carries no Iris loan.
   * @throws {UnhealthyBondError} when `amount` would leave the bond unhealthy.
   */
  withdrawBond({
    userAddress,
    positionData,
    amount,
  }: {
    userAddress: Address;
    positionData: AccrualPosition;
    amount: bigint;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);
    validateUserAddress(userAddress, positionData.loan.solver);

    if (amount <= 0n) throw new NonPositiveInputError("amount", amount);

    const { pod } = positionData;

    if (positionData.lastUpdate === 0n) throw new LoanNotCreatedError(pod);

    const withdrawable = PositionUtils.getWithdrawableBond(positionData, {
      bondLltv: MathLib.zeroFloorSub(positionData.loan.bondLltv, DEFAULT_LLTV_BUFFER),
    });

    if (amount > withdrawable) {
      throw new UnhealthyBondError({ pod, withdrawAmount: amount, withdrawable });
    }

    return {
      buildTx: () =>
        irisWithdrawBond({
          chainId: this.chainId,
          args: { pod, amount, receiver: userAddress },
        }),
    };
  }

  /**
   * Prepares a claim transaction drawing down `userAddress`'s claimable Iris balance.
   *
   * Validates the claim against the pre-fetched `claimableData`: `Iris.claim` debits the balance
   * directly, so a claim above it reverts with a bare arithmetic underflow rather than a named
   * error.
   *
   * @param params.userAddress - The account sending the transaction, whose claimable balance is
   *   drawn down and which receives the tokens; must be that account or be authorized by it on
   *   Iris.
   * @param params.token - Token the claimable balance is denominated in.
   * @param params.claimableData - Pre-fetched claimable balance for `userAddress` and `token`,
   *   from {@link Iris.getClaimableData}.
   * @param params.amount - The amount to claim. Defaults to `claimableData` — the whole balance.
   * @returns Object with `buildTx`.
   * @throws {ChainIdMismatchError} when the client's chain differs from the entity's chain.
   * @throws {NonPositiveInputError} when `amount` is not positive — including a defaulted `amount`
   *   on an account with nothing to claim.
   * @throws {ClaimExceedsClaimableError} when `amount` exceeds `claimableData`.
   */
  claim({
    userAddress,
    token,
    claimableData,
    amount = claimableData,
  }: {
    userAddress: Address;
    token: Address;
    claimableData: bigint;
    amount?: bigint;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    if (amount <= 0n) throw new NonPositiveInputError("amount", amount);

    if (amount > claimableData) {
      throw new ClaimExceedsClaimableError({
        token,
        account: userAddress,
        amount,
        claimable: claimableData,
      });
    }

    return {
      buildTx: () =>
        irisClaim({
          chainId: this.chainId,
          args: { token, amount, onBehalf: userAddress, receiver: userAddress },
        }),
    };
  }

  /**
   * Prepares an escape transaction exiting the venue position of a resolved Iris loan.
   *
   * Escape settles the pod's venue debt and withdraws the venue collateral, yield included, to
   * `userAddress`. The bundle funds `GeneralAdapter1` with the venue debt projected two hours past
   * now — `Iris.escape` pulls it as it stands at execution, so funding the fetched amount
   * underfunds the bundle on a venue that keeps accruing — and skims the residual back.
   *
   * @param params.userAddress - The account sending the transaction, funding the venue debt and
   *   receiving the collateral; must be the loan's borrower, whose Iris authorization of
   *   `GeneralAdapter1` the bundled escape runs on.
   * @param params.positionData - Pre-fetched position for the pod, from
   *   {@link Iris.getPositionData}; supplies the pod, its resolution state and its venue debt.
   * @param params.nativeAmount - Optional venue debt paid in the native token and wrapped
   *   in-bundle; the loan's debt token must be the chain's wNative.
   * @returns Object with `buildTx` and `getRequirements`.
   * @throws {ChainIdMismatchError} when the client's chain differs from the entity's chain.
   * @throws {AddressMismatchError} when `userAddress` is not the loan's borrower.
   * @throws {LoanNotCreatedError} when the pod carries no Iris loan.
   * @throws {LoanNotResolvedError} when the loan is still open (non-zero bond requirement).
   * @throws {NegativeInputError} when `nativeAmount` is negative.
   * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but the loan's debt token
   *   is not the chain's wNative.
   */
  escape({
    userAddress,
    positionData,
    nativeAmount = 0n,
  }: {
    userAddress: Address;
    positionData: AccrualPosition;
    nativeAmount?: bigint;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    const { pod, lastUpdate, bondRequirement, loan, venue } = positionData;

    // `GeneralAdapter1.irisEscape` pins the borrower to the bundle initiator.
    validateUserAddress(userAddress, loan.borrower);

    if (lastUpdate === 0n) throw new LoanNotCreatedError(pod);
    if (bondRequirement !== 0n) throw new LoanNotResolvedError(pod);

    if (nativeAmount < 0n) throw new NegativeInputError("nativeAmount", nativeAmount);
    if (nativeAmount > 0n) validateNativeAsset(this.chainId, loan.debtToken);

    // Forward-accrue the venue debt: Iris pulls it as it stands at execution, so the fetched
    // amount underfunds the bundle. The residual is skimmed back by the escape action.
    const accrualTimestamp = MathLib.max(Time.timestamp(), venue.lastUpdate) + Time.s.from.h(2n);
    const venueDebt = venue.getAccrualDebt(accrualTimestamp);
    // Native funds the debt first; the ERC-20 pulled is the remainder.
    const amount = MathLib.zeroFloorSub(venueDebt, nativeAmount);

    return {
      getRequirements: async (params?: { useSimplePermit?: boolean }) => {
        const [erc20Requirements, authorizationRequirement] = await Promise.all([
          getGeneralAdapterRequirements(this.client.viemClient, {
            address: loan.debtToken,
            chainId: this.chainId,
            supportSignature: this.client.options.supportSignature,
            useSimplePermit: params?.useSimplePermit,
            args: { amount, from: userAddress },
          }),
          getIrisAuthorizationRequirement({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            userAddress: loan.borrower,
            supportSignature: this.client.options.supportSignature,
          }),
        ]);

        return [
          ...erc20Requirements,
          ...(authorizationRequirement ? [authorizationRequirement] : []),
        ];
      },

      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit, authorization } = selectRequirementSignatures(signatures, {
          permit: true,
          authorization: true,
        });

        return irisEscape({
          chainId: this.chainId,
          args: {
            pod,
            token: loan.debtToken,
            receiver: userAddress,
            amount,
            nativeAmount,
            requirementSignature: permit,
            authorizationSignature: authorization,
          },
        });
      },
    };
  }

  /**
   * Prepares a refinance transaction moving an existing Iris loan's position to another venue.
   *
   * Replays the migration against the pre-fetched `positionData` and `newVenue` (see
   * `AccrualPosition.refinance`) to reject what the contract rejects, then funds the debt the pod
   * owes its current venue, forward-accrued two hours past now — `Iris.refinance` pulls it as it
   * stands at execution, so funding the fetched amount underfunds the bundle on a venue that keeps
   * accruing — and skims the residual back.
   *
   * Whether the new venue's `data` is enabled on Iris is not read here; the contract rejects a
   * disabled payload at execution (see `fetchIsDataEnabled` to check it upfront).
   *
   * @param params.userAddress - Account funding the venue debt and receiving the new venue's
   *   borrow proceeds (the bundle initiator); must be the loan's solver.
   * @param params.positionData - Pre-fetched position for the pod, from
   *   {@link Iris.getPositionData}; supplies the pod, the loan and the venue debt to clear.
   * @param params.newVenue - Pre-fetched target venue for the pod, from
   *   {@link Iris.getVenueData}; supplies the venue id and market data.
   * @param params.nativeAmount - Optional venue debt paid in the native token and wrapped
   *   in-bundle; the loan's debt token must be the chain's wNative.
   * @returns Object with `buildTx` and `getRequirements`.
   * @throws {ChainIdMismatchError} when the client's chain differs from the entity's chain.
   * @throws {AddressMismatchError} when `userAddress` is not the loan's solver.
   * @throws {NegativeInputError} when `nativeAmount` is negative.
   * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but the loan's debt token
   *   is not the chain's wNative.
   * @throws {IrisCoreErrors.UnexpectedPod} when `newVenue` is not a view of the position's pod.
   * @throws {IrisCoreErrors.UnknownVenuePrice} when either venue's price is unknown.
   * @throws {IrisCoreErrors.LoanResolved} when the loan is already resolved.
   * @throws {IrisCoreErrors.NotAllowedVenue} when the loan's venue bitmap disallows `newVenue`.
   * @throws {IrisCoreErrors.InsufficientVenueCollateral} when `newVenue` cannot carry the
   *   migrated position.
   */
  refinance({
    userAddress,
    positionData,
    newVenue,
    nativeAmount = 0n,
  }: {
    userAddress: Address;
    positionData: AccrualPosition;
    newVenue: Venue;
    nativeAmount?: bigint;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    const { pod, lastUpdate, venue } = positionData;
    const { debtToken, solver } = positionData.loan;

    validateUserAddress(userAddress, solver);

    if (nativeAmount < 0n) throw new NegativeInputError("nativeAmount", nativeAmount);
    if (nativeAmount > 0n) validateNativeAsset(this.chainId, debtToken);

    // Forward-accrue (2h) before sizing the funding: Iris pulls the venue debt as it stands at
    // execution, so funding the amount owed now under-funds the pull.
    const accrualTimestamp =
      MathLib.max(Time.timestamp(), lastUpdate, venue.lastUpdate) + Time.s.from.h(2n);
    positionData.refinance(newVenue, accrualTimestamp);
    const venueDebt = venue.getAccrualDebt(accrualTimestamp);
    // Native funds the pull first; the ERC-20 pulled is the remainder.
    const amount = MathLib.zeroFloorSub(venueDebt, nativeAmount);

    return {
      getRequirements: async (params?: { useSimplePermit?: boolean }) => {
        const [erc20Requirements, authorizationRequirement] = await Promise.all([
          getGeneralAdapterRequirements(this.client.viemClient, {
            address: debtToken,
            chainId: this.chainId,
            supportSignature: this.client.options.supportSignature,
            args: { amount, from: userAddress },
            useSimplePermit: params?.useSimplePermit,
          }),
          getIrisAuthorizationRequirement({
            viemClient: this.client.viemClient,
            chainId: this.chainId,
            userAddress: solver,
            supportSignature: this.client.options.supportSignature,
          }),
        ]);

        return [
          ...erc20Requirements,
          ...(authorizationRequirement ? [authorizationRequirement] : []),
        ];
      },

      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit, authorization } = selectRequirementSignatures(signatures, {
          permit: true,
          authorization: true,
        });

        return irisRefinance({
          chainId: this.chainId,
          args: {
            pod,
            token: debtToken,
            receiver: userAddress,
            amount,
            nativeAmount,
            newVenueId: newVenue.id,
            data: newVenue.data,
            requirementSignature: permit,
            authorizationSignature: authorization,
          },
        });
      },
    };
  }
}

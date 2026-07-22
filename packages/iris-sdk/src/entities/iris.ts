import type { Address, Hex } from "viem";
import type { ChainId, Quote } from "@iris-credit/core-sdk";
import type { IrisClientType } from "../types/client.js";
import type {
  AuthorizationRequirementSignature,
  ERC20ApprovalAction,
  IrisAuthorizationAction,
  IrisTakeAction,
  PermitRequirementSignature,
  Requirement,
  RequirementSignature,
  SolverPermit2,
  Transaction,
} from "../types/index.js";

import { isAddressEqual, zeroAddress } from "viem";
import {
  BP,
  MAX_DURATION,
  MAX_FIXED_RATE,
  MAX_OVERDUE_PERIOD,
  MAX_OVERDUE_RATE,
  MIN_DURATION,
} from "@iris-credit/core-sdk";
import { Time } from "@iris-credit/iris-ts";
import { irisTake } from "../actions/iris/take.js";
import { getGeneralAdapterRequirements } from "../actions/requirements/generalAdapter/getGeneralAdapterRequirements.js";
import { getIrisAuthorizationRequirement } from "../actions/requirements/iris/getIrisAuthorizationRequirement.js";
import { validateChainId, validateNativeAsset, validateUserAddress } from "../helpers/index.js";
import {
  NativeAmountExceedsCollateralError,
  NegativeInputError,
  NotMultipleOfBpError,
  QuoteExpiredError,
  QuoteOutOfBoundsError,
  selectRequirementSignatures,
  SolverPermit2AmountBelowBondError,
  SolverPermit2AssetMismatchError,
  SolverPermit2ExpiredError,
  VenueNotSupportedError,
  ZeroAddressError,
  ZeroBondAmountError,
  ZeroCollateralAmountError,
  ZeroDebtAmountError,
} from "../types/index.js";

/** Flow methods exposed by the chain-scoped Iris entity. */
export interface IrisActions {
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
}

/** Chain-scoped Iris entity: validates flows and returns lazy transaction handles. */
export class Iris implements IrisActions {
  constructor(
    private readonly client: IrisClientType,
    private readonly chainId: ChainId,
  ) {}

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
   * @throws {ZeroCollateralAmountError} when `quote.collateral` is zero.
   * @throws {ZeroDebtAmountError} when `quote.debt` is zero.
   * @throws {ZeroBondAmountError} when `quote.bond` is zero.
   * @throws {NegativeInputError} when `nativeAmount` is negative.
   * @throws {NativeAmountExceedsCollateralError} when `nativeAmount` exceeds `quote.collateral`.
   * @throws {NativeAmountOnNonWNativeAssetError} when `nativeAmount > 0n` but the collateral
   *   token is not the chain's wNative.
   * @throws {QuoteOutOfBoundsError} when a rate / duration / overdue field is out of bounds.
   * @throws {NotMultipleOfBpError} when `fixedRate` or `overdueRate` is not a multiple of BP.
   * @throws {VenueNotSupportedError} when `quote.venueId` is not set in `quote.venueBitmap`.
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

    if (quote.collateral <= 0n) throw new ZeroCollateralAmountError(quote.collateralToken);
    if (quote.debt <= 0n) throw new ZeroDebtAmountError(quote.debtToken);

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

    if (quote.bond <= 0n) throw new ZeroBondAmountError(quote.debtToken);

    if (quote.venueId >= 256n || (quote.venueBitmap & (1n << quote.venueId)) === 0n) {
      throw new VenueNotSupportedError(quote.venueId, quote.venueBitmap);
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
}

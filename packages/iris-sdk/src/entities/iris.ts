import type { Address, Hex } from "viem";
import type { ChainId, Quote } from "@iris-credit/core-sdk";
import type { IrisClientType } from "../types/client.js";
import type {
  Bundler3TokenSignatureRequirement,
  ERC20ApprovalAction,
  IrisTakeAction,
  RequirementSignature,
  Transaction,
} from "../types/index.js";

import { erc20Abi } from "viem";
import { readContract, verifyTypedData } from "viem/actions";
import {
  getChainAddresses,
  getQuoteTypedData,
  irisAbi,
  MAX_DURATION,
  MAX_FIXED_RATE,
  MAX_OVERDUE_PERIOD,
  MAX_OVERDUE_RATE,
  MIN_DURATION,
  permit2Abi,
} from "@iris-credit/core-sdk";
import { Time } from "@iris-credit/iris-ts";
import { irisTake } from "../actions/iris/take.js";
import { getGeneralAdapterRequirements } from "../actions/requirements/generalAdapter/getGeneralAdapterRequirements.js";
import { validateChainId } from "../helpers/index.js";
import {
  InsufficientBondError,
  InvalidSignatureError,
  NonceAlreadyUsedError,
  QuoteExpiredError,
  QuoteOutOfBoundsError,
  selectRequirementSignatures,
  VenueNotSupportedError,
} from "../types/index.js";

/** On-chain state read by {@link Iris.getTakeData} and validated by {@link Iris.take}. */
export interface TakeData {
  /** Whether the quote's nonce has already been consumed on Iris. */
  readonly nonceUsed: boolean;
  /** Whether the quote signature verifies against `quote.solver` (ECDSA or ERC-1271). */
  readonly signatureValid: boolean;
  /** The solver's debt-token balance. */
  readonly solverBalance: bigint;
  /** The solver's direct debt-token allowance to the Iris core. */
  readonly solverAllowance: bigint;
  /** The solver's debt-token allowance to the Permit2 contract. */
  readonly solverPermit2Erc20Allowance: bigint;
  /** The Permit2-managed allowance amount for (solver, debtToken, Iris core). */
  readonly solverPermit2Allowance: bigint;
  /** The Permit2-managed allowance expiration timestamp in seconds. */
  readonly solverPermit2Expiration: bigint;
}

/** Flow methods exposed by the chain-scoped Iris entity. */
export interface IrisActions {
  /**
   * Reads the on-chain state {@link take} validates: the quote's nonce usage, the quote
   * signature's validity (ECDSA or ERC-1271 via the client), and the solver's debt-token funding
   * for the bond pull (balance, direct allowance to the Iris core, and the Permit2 fallback
   * allowances). Returns raw data without judging it — `take` throws the typed errors.
   *
   * @param params.quote - The solver-signed quote to read state for.
   * @param params.quoteSignature - The solver's EIP-712 signature over the quote.
   * @returns The raw on-chain state consumed by `take`.
   */
  getTakeData: (params: { quote: Quote; quoteSignature: Hex }) => Promise<TakeData>;

  /**
   * Prepares a take transaction opening an Iris loan from a solver-signed quote.
   *
   * `getRequirements` returns the collateral-token approval `Transaction` or permit / Permit2
   * signature `Requirement` for `GeneralAdapter1`; pass `useSimplePermit: true` to prefer an
   * EIP-2612 permit when the token supports it. No Iris authorization is needed: taking opens a
   * new loan and the collateral is paid by the bundle.
   *
   * @param params - Take parameters, including the pre-fetched {@link TakeData}.
   * @returns Object with `buildTx` and `getRequirements`.
   */
  take: (params: {
    userAddress: Address;
    quote: Quote;
    quoteSignature: Hex;
    takeData: TakeData;
  }) => {
    buildTx: (
      signatures?: readonly RequirementSignature[],
    ) => Readonly<Transaction<IrisTakeAction>>;
    getRequirements: (params?: {
      useSimplePermit?: boolean;
    }) => Promise<
      (Readonly<Transaction<ERC20ApprovalAction>> | Bundler3TokenSignatureRequirement)[]
    >;
  };
}

/** Chain-scoped Iris entity: validates flows, reads state, and returns lazy transaction handles. */
export class Iris implements IrisActions {
  constructor(
    private readonly client: IrisClientType,
    private readonly chainId: ChainId,
  ) {}

  /**
   * Reads the on-chain state {@link take} validates, batched into one parallel round trip.
   *
   * **Stale `TakeData` only weakens the pre-flight check** — the chain re-validates everything
   * at execution time, so a state change between this read and submission surfaces as an
   * on-chain revert, never as a wrong transaction.
   *
   * @param params.quote - The solver-signed quote to read state for.
   * @param params.quoteSignature - The solver's EIP-712 signature over the quote.
   * @returns The raw on-chain state consumed by `take`.
   * @throws {ChainIdMismatchError} when the client's chain differs from the entity's chain.
   */
  async getTakeData({
    quote,
    quoteSignature,
  }: {
    quote: Quote;
    quoteSignature: Hex;
  }): Promise<TakeData> {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    const { iris, permit2 } = getChainAddresses(this.chainId);
    const typedData = getQuoteTypedData(this.chainId, quote);

    const [
      nonceUsed,
      signatureValid,
      solverBalance,
      solverAllowance,
      [permit2Allowance, permit2Expiration],
      solverPermit2Erc20Allowance,
    ] = await Promise.all([
      readContract(this.client.viemClient, {
        abi: irisAbi,
        address: iris,
        functionName: "isNonceUsed",
        args: [quote.solver, quote.nonce],
      }),
      verifyTypedData(this.client.viemClient, {
        ...typedData,
        address: quote.solver, // Verify against the solver (ECDSA or ERC-1271).
        signature: quoteSignature,
      }),
      readContract(this.client.viemClient, {
        abi: erc20Abi,
        address: quote.debtToken,
        functionName: "balanceOf",
        args: [quote.solver],
      }),
      readContract(this.client.viemClient, {
        abi: erc20Abi,
        address: quote.debtToken,
        functionName: "allowance",
        args: [quote.solver, iris],
      }),
      readContract(this.client.viemClient, {
        abi: permit2Abi,
        address: permit2,
        functionName: "allowance",
        args: [quote.solver, quote.debtToken, iris],
      }),
      readContract(this.client.viemClient, {
        abi: erc20Abi,
        address: quote.debtToken,
        functionName: "allowance",
        args: [quote.solver, permit2],
      }),
    ]);

    return {
      nonceUsed,
      signatureValid,
      solverBalance,
      solverAllowance,
      solverPermit2Erc20Allowance,
      solverPermit2Allowance: BigInt(permit2Allowance),
      solverPermit2Expiration: BigInt(permit2Expiration),
    };
  }

  /**
   * Prepares a take transaction opening an Iris loan from a solver-signed quote.
   *
   * Validates the quote's shape — deadline not expired, `fixedRate` / `duration` /
   * `overdueRate` / `overduePeriod` within the protocol bounds mirrored from `ConstantsLib`,
   * and `venueId` enabled in `venueBitmap` — and the pre-fetched {@link TakeData}: nonce unused,
   * quote signature valid, and the solver's debt-token funding covering the bond pull through
   * either the direct allowance or the Permit2 fallback (mirroring `safeTransferFrom2`).
   *
   * @param params.userAddress - Account funding the collateral (the bundle initiator).
   * @param params.quote - The solver-signed quote to take.
   * @param params.quoteSignature - The solver's EIP-712 signature over the quote.
   * @param params.takeData - On-chain state from {@link getTakeData}.
   * @returns Object with `buildTx` and `getRequirements`.
   * @throws {ChainIdMismatchError} when the client's chain differs from the entity's chain.
   * @throws {QuoteExpiredError} when `quote.deadline` has passed.
   * @throws {QuoteOutOfBoundsError} when a rate / duration / overdue field is out of bounds.
   * @throws {VenueNotSupportedError} when `quote.venueId` is not set in `quote.venueBitmap`.
   * @throws {NonceAlreadyUsedError} when the quote's nonce is already consumed on Iris.
   * @throws {InvalidSignatureError} when the quote signature does not verify against the solver.
   * @throws {InsufficientBondError} when the solver's funding cannot cover the bond pull.
   */
  take({
    userAddress,
    quote,
    quoteSignature,
    takeData,
  }: {
    userAddress: Address;
    quote: Quote;
    quoteSignature: Hex;
    takeData: TakeData;
  }) {
    validateChainId(this.client.viemClient.chain?.id, this.chainId);

    if (quote.deadline < Time.timestamp()) {
      throw new QuoteExpiredError(quote.deadline);
    }

    if (quote.fixedRate < 0n || quote.fixedRate > MAX_FIXED_RATE) {
      throw new QuoteOutOfBoundsError("fixedRate", quote.fixedRate, 0n, MAX_FIXED_RATE);
    }

    if (quote.duration < MIN_DURATION || quote.duration > MAX_DURATION) {
      throw new QuoteOutOfBoundsError("duration", quote.duration, MIN_DURATION, MAX_DURATION);
    }

    if (quote.overdueRate < 0n || quote.overdueRate > MAX_OVERDUE_RATE) {
      throw new QuoteOutOfBoundsError("overdueRate", quote.overdueRate, 0n, MAX_OVERDUE_RATE);
    }

    if (quote.overduePeriod < 0n || quote.overduePeriod > MAX_OVERDUE_PERIOD) {
      throw new QuoteOutOfBoundsError("overduePeriod", quote.overduePeriod, 0n, MAX_OVERDUE_PERIOD);
    }

    if (quote.venueId >= 256n || (quote.venueBitmap & (1n << quote.venueId)) === 0n) {
      throw new VenueNotSupportedError(quote.venueId, quote.venueBitmap);
    }

    if (takeData.nonceUsed) {
      throw new NonceAlreadyUsedError(quote.solver, quote.nonce);
    }

    if (!takeData.signatureValid) {
      throw new InvalidSignatureError();
    }

    // Mirror `safeTransferFrom2`: the bond pull succeeds through the direct allowance, or through
    // the Permit2 fallback when both the Permit2-managed allowance (unexpired) and the ERC-20
    // allowance to the Permit2 contract cover it.
    const permit2Covered =
      takeData.solverPermit2Allowance >= quote.bond &&
      takeData.solverPermit2Expiration >= Time.timestamp() &&
      takeData.solverPermit2Erc20Allowance >= quote.bond;
    const covered = takeData.solverAllowance >= quote.bond || permit2Covered;

    if (takeData.solverBalance < quote.bond || !covered) {
      throw new InsufficientBondError({
        solver: quote.solver,
        bond: quote.bond,
        balance: takeData.solverBalance,
        allowance: takeData.solverAllowance,
      });
    }

    return {
      getRequirements: (params?: { useSimplePermit?: boolean }) =>
        getGeneralAdapterRequirements(this.client.viemClient, {
          address: quote.collateralToken,
          chainId: this.chainId,
          supportSignature: this.client.options.supportSignature,
          args: { amount: quote.collateral, from: userAddress },
          useSimplePermit: params?.useSimplePermit,
        }),

      buildTx: (signatures?: readonly RequirementSignature[]) => {
        const { permit } = selectRequirementSignatures(signatures, { permit: true });

        return irisTake({
          chainId: this.chainId,
          args: { quote, quoteSignature, requirementSignature: permit },
        });
      },
    };
  }
}

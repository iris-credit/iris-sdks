import type { Address, Hex, WalletClient } from "viem";
import type { Quote } from "@iris-credit/core-sdk";

import {
  AmbiguousRequirementSignaturesError,
  UnexpectedRequirementSignatureError,
} from "./errors.js";

export interface BaseAction<
  TType extends string = string,
  TArgs extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly type: TType;
  readonly args: TArgs;
}

export interface ERC20ApprovalAction extends BaseAction<
  "erc20Approval",
  { spender: Address; amount: bigint }
> {}

export interface IrisTakeAction extends BaseAction<
  "irisTake",
  { quote: Quote; quoteSignature: Hex }
> {}

// TODO: complete below iris action interfaces.
export interface IrisRepayAction extends BaseAction<"irisRepay"> {}

export interface IrisSupplyCollateralAction extends BaseAction<"irisSupplyCollateral"> {}

export interface IrisWithdrawCollateralAction extends BaseAction<"irisWithdrawCollateral"> {}

export interface IrisSupplyBondAction extends BaseAction<"irisSupplyBond"> {}

export interface IrisWithdrawBondAction extends BaseAction<"irisWithdrawBond"> {}

export interface IrisRefinanceAction extends BaseAction<"irisRefinance"> {}

export interface IrisEscapeAction extends BaseAction<"irisEscape"> {}

export interface IrisClaimAction extends BaseAction<"irisClaim"> {}

export interface IrisAuthorizationAction extends BaseAction<
  "irisAuthorization",
  {
    authorized: Address;
    isAuthorized: boolean;
  }
> {}

export type TransactionAction =
  | ERC20ApprovalAction
  | IrisTakeAction
  | IrisRepayAction
  | IrisSupplyCollateralAction
  | IrisWithdrawCollateralAction
  | IrisSupplyBondAction
  | IrisWithdrawBondAction
  | IrisRefinanceAction
  | IrisEscapeAction
  | IrisClaimAction
  | IrisAuthorizationAction;

export interface Transaction<TAction extends BaseAction = TransactionAction> {
  readonly to: Address;
  readonly value: bigint;
  readonly data: Hex;
  readonly action: TAction;
}

export interface Permit2Args {
  owner: Address;
  nonce: bigint;
  asset: Address;
  signature: Hex;
  amount: bigint;
  deadline: bigint;
  expiration: bigint;
}

/**
 * Signed Iris authorization payload produced when an integrator opts into offchain
 * signatures (`supportSignature: true`). Consumed by the action layer to emit a
 * `setAuthorizationWithSig` bundler call in place of a standalone `setAuthorization` transaction.
 */
export interface AuthorizationSignatureArgs {
  /** Account granting the authorization (the position owner). */
  owner: Address;
  /** Account being authorized to operate on Iris on the owner's behalf (GeneralAdapter1). */
  authorized: Address;
  /** Whether the authorization is granted (`true`) or revoked (`false`). */
  isAuthorized: boolean;
  /** Iris authorization nonce consumed by the signature. */
  nonce: bigint;
  /** Signature deadline timestamp in seconds. */
  deadline: bigint;
  /** EIP-712 signature over the Iris `Authorization` typed data. */
  signature: Hex;
}

/** Signed solver quote payload, distributed off-chain via the RFQ and consumed by `Iris.take`. */
export interface QuoteSignatureArgs {
  readonly solver: Address;
  readonly quote: Quote;
  readonly signature: Hex;
}

/**
 * A signable approval / authorization requirement. `sign()` returns the matching
 * {@link RequirementSignature}; `action` describes the requirement without signing.
 *
 * Generic over the signature it produces so permit encoders narrow to
 * {@link PermitRequirementSignature} and the authorization encoder to
 * {@link AuthorizationRequirementSignature}; the default keeps the broad union for mixed arrays.
 */
export interface Requirement<TSignature extends RequirementSignature = RequirementSignature> {
  sign: (client: WalletClient, userAddress: Address) => Promise<TSignature>;
  action: TSignature["action"];
}

export interface Permit2Action extends BaseAction<
  "permit2",
  { spender: Address; amount: bigint; deadline: bigint; expiration: bigint }
> {}

/**
 * Signable Iris authorization requirement. Emitted by the entity layer when a bundled path
 * needs GeneralAdapter1 authorized and the client opts into offchain signatures.
 */
export interface AuthorizationAction extends BaseAction<
  "authorization",
  { authorized: Address; isAuthorized: boolean; deadline: bigint }
> {}

/** Signable solver quote requirement — the maker flow's EIP-712 `Quote` signature. */
export interface QuoteSignatureAction extends BaseAction<
  "quoteSignature",
  { solver: Address; nonce: bigint; deadline: bigint }
> {}

/** A signed Permit2 approval requirement. */
export interface PermitRequirementSignature {
  args: Permit2Args;
  action: Permit2Action;
}

/** A signed Iris authorization requirement (consumed via `setAuthorizationWithSig`). */
export interface AuthorizationRequirementSignature {
  args: AuthorizationSignatureArgs;
  action: AuthorizationAction;
}

/** A signed solver quote requirement (the maker flow's final signature artifact). */
export interface QuoteRequirementSignature {
  args: QuoteSignatureArgs;
  action: QuoteSignatureAction;
}

/**
 * The deep-frozen output of `Requirement.sign()`. Discriminated on `action.type`:
 * `"permit2"` carries token-approval args, `"authorization"` the signed
 * Iris authorization, and `"quoteSignature"` the signed solver quote. Narrow with
 * {@link isPermitSignature} / {@link isAuthorizationSignature} / {@link isQuoteSignature}.
 */
export type RequirementSignature =
  | PermitRequirementSignature
  | AuthorizationRequirementSignature
  | QuoteRequirementSignature;

/** Bundler3 token signature requirement. */
export type Bundler3TokenSignatureRequirement = Requirement<PermitRequirementSignature>;

export function isRequirementApproval(
  requirement: unknown,
): requirement is Transaction<ERC20ApprovalAction> {
  return (
    typeof requirement === "object" &&
    requirement !== null &&
    "to" in requirement &&
    "value" in requirement &&
    "data" in requirement &&
    "action" in requirement &&
    typeof requirement.action === "object" &&
    requirement.action !== null &&
    "type" in requirement.action &&
    requirement.action.type === "erc20Approval"
  );
}

/** Checks whether an action requirement is an Iris authorization transaction. */
export function isRequirementIrisAuthorization(
  requirement: unknown,
): requirement is Transaction<IrisAuthorizationAction> {
  return (
    typeof requirement === "object" &&
    requirement !== null &&
    "to" in requirement &&
    "value" in requirement &&
    "data" in requirement &&
    "action" in requirement &&
    typeof requirement.action === "object" &&
    requirement.action !== null &&
    "type" in requirement.action &&
    requirement.action.type === "irisAuthorization"
  );
}

export function isRequirementSignature<T extends RequirementSignature = RequirementSignature>(
  requirement:
    | Transaction<ERC20ApprovalAction>
    | Transaction<IrisAuthorizationAction>
    | Requirement<T>
    | undefined,
): requirement is Requirement<T> {
  return (
    requirement !== undefined &&
    typeof requirement === "object" &&
    requirement !== null &&
    "sign" in requirement &&
    typeof requirement.sign === "function"
  );
}

/**
 * Narrows a {@link RequirementSignature} to a Permit2 token-approval signature.
 *
 * @param signature - The signed requirement to test.
 * @returns `true` when `signature.action.type` is `"permit2"`.
 */
export function isPermitSignature(
  signature: RequirementSignature,
): signature is PermitRequirementSignature {
  return signature.action.type === "permit2";
}

/**
 * Narrows a {@link RequirementSignature} to a signed Iris authorization.
 *
 * @param signature - The signed requirement to test.
 * @returns `true` when `signature.action.type` is `"authorization"`.
 */
export function isAuthorizationSignature(
  signature: RequirementSignature,
): signature is AuthorizationRequirementSignature {
  return signature.action.type === "authorization";
}

/**
 * Narrows a {@link RequirementSignature} to a signed solver quote.
 *
 * @param signature - The signed requirement to test.
 * @returns `true` when `signature.action.type` is `"quoteSignature"`.
 */
export function isQuoteSignature(
  signature: RequirementSignature,
): signature is QuoteRequirementSignature {
  return signature.action.type === "quoteSignature";
}

/** The typed permit / authorization slots a bundled path consumes, split from a `buildTx` array. */
export interface SelectedRequirementSignatures {
  /** The single Permit2 token-approval signature, when present. */
  permit?: PermitRequirementSignature;
  /** The single Iris authorization signature, when present. */
  authorization?: AuthorizationRequirementSignature;
}

/**
 * Splits a `buildTx` signature array into its typed permit / authorization slots, rejecting
 * ambiguous or unexpected input so a path never silently consumes the wrong signature.
 *
 * A bundled path consumes at most one permit and one authorization signature. Passing several of
 * the same kind, or a kind the path does not consume, is rejected with a typed error rather than
 * silently dropping the extras — the latter could otherwise leave a required authorization or
 * permit unsigned (and the bundle reverting on-chain) or apply the wrong signature. Quote
 * signatures are always rejected: they are consumed by the maker flow's `buildResponse`, never
 * by `buildTx`.
 *
 * @param signatures - The signatures passed to `buildTx`.
 * @param accepts - Which signature kinds this operation consumes.
 * @param accepts.permit - Whether a Permit2 signature is consumed.
 * @param accepts.authorization - Whether an Iris authorization signature is consumed.
 * @returns The single permit and/or authorization signature, when present.
 * @throws {AmbiguousRequirementSignaturesError} when more than one signature of an accepted kind is present.
 * @throws {UnexpectedRequirementSignatureError} when a signature of a kind the operation does not consume is present.
 * @example
 * ```ts
 * import { selectRequirementSignatures } from "@iris-credit/iris-sdk";
 *
 * const { permit, authorization } = selectRequirementSignatures(signatures, {
 *   permit: true,
 *   authorization: true,
 * });
 * ```
 */
export function selectRequirementSignatures(
  signatures: readonly RequirementSignature[] | undefined,
  accepts: { permit?: boolean; authorization?: boolean },
): SelectedRequirementSignatures {
  if (signatures == null) return {};

  const permits = signatures.filter(isPermitSignature);
  const authorizations = signatures.filter(isAuthorizationSignature);

  const quotes = signatures.filter(isQuoteSignature);
  if (quotes.length > 0) throw new UnexpectedRequirementSignatureError("quote");

  if (!accepts.permit && permits.length > 0)
    throw new UnexpectedRequirementSignatureError("permit");
  if (!accepts.authorization && authorizations.length > 0)
    throw new UnexpectedRequirementSignatureError("authorization");
  if (permits.length > 1) throw new AmbiguousRequirementSignaturesError("permit", permits.length);
  if (authorizations.length > 1)
    throw new AmbiguousRequirementSignaturesError("authorization", authorizations.length);

  return { permit: permits[0], authorization: authorizations[0] };
}

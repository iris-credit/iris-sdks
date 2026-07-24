import type { Address } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type { Action } from "../../bundler/type.js";
import type {
  AuthorizationRequirementSignature,
  IrisClaimAction,
  Transaction,
} from "../../types/index.js";

import { deepFreeze } from "@iris-credit/iris-ts";
import { BundlerAction } from "../../bundler/actions.js";
import { ZeroAmountError } from "../../types/index.js";
import { getIrisAuthorizationAction } from "../signatures/getIrisAuthorizationAction.js";

/** Parameters for {@link irisClaim}. */
export interface IrisClaimParams {
  /** The chain the bundle targets. */
  readonly chainId: ChainId;
  readonly args: {
    /** The token to claim. */
    readonly token: Address;
    /** The amount of token to claim. */
    readonly amount: bigint;
    /** The address receiving the claimed tokens. */
    readonly receiver: Address;
    /**
     * Optional signed Iris authorization granting `GeneralAdapter1` operator rights for the
     * bundle initiator, folded into the bundle via `setAuthorizationWithSig`.
     */
    readonly authorizationSignature?: AuthorizationRequirementSignature;
  };
}

/**
 * Prepares a claim transaction transferring tokens accrued on Iris to `receiver`.
 *
 * Routed through bundler3 via `GeneralAdapter1`, composing the bundle in on-chain execution
 * order:
 *
 * 1. `irisSetAuthorizationWithSig` — when `authorizationSignature` is provided, grants
 *    `GeneralAdapter1` operator rights for the initiator. `GeneralAdapter1.irisClaim` claims on
 *    behalf of the bundle initiator, and `Iris.claim` requires its caller — the adapter, in a
 *    bundled claim — to be authorized by that account, so a bundled claim reverts `Unauthorized`
 *    unless the initiator authorized the adapter beforehand or this signature is included.
 * 2. `irisClaim(token, amount, receiver)` — deducts `amount` from the initiator's claimable
 *    balance on Iris and transfers it to `receiver`.
 *
 * @param params.chainId - The chain the bundle targets.
 * @param params.args.token - The token to claim.
 * @param params.args.amount - The amount of token to claim.
 * @param params.args.receiver - The address receiving the claimed tokens.
 * @param params.args.authorizationSignature - Optional signed Iris authorization for the initiator.
 * @returns A deep-frozen `Transaction<IrisClaimAction>` with `to`, `value`, `data`, and the typed
 *   `action` discriminator.
 * @throws {ZeroAmountError} when `amount` is not positive.
 * @throws {BundlerErrors.UnexpectedSignature} from `getIrisAuthorizationAction` when
 *   `authorizationSignature.args.authorized` is not the chain's `GeneralAdapter1`.
 * @example
 * ```ts
 * import { irisClaim } from "@iris-credit/iris-sdk";
 *
 * const tx = irisClaim({
 *   chainId: 1,
 *   args: {
 *     token,
 *     amount,
 *     receiver,
 *     authorizationSignature, // optional — Iris authorization the claimer signed
 *   },
 * });
 * // tx satisfies Readonly<Transaction<IrisClaimAction>>
 * ```
 */
export const irisClaim = ({
  chainId,
  args: { token, amount, receiver, authorizationSignature },
}: IrisClaimParams): Readonly<Transaction<IrisClaimAction>> => {
  if (amount <= 0n) throw new ZeroAmountError("claim", token);

  const actions: Action[] = [];

  if (authorizationSignature) {
    actions.push(getIrisAuthorizationAction(chainId, authorizationSignature));
  }

  actions.push({
    type: "irisClaim",
    args: [token, amount, receiver, false /* skipRevert */],
  });

  const tx = BundlerAction.encodeBundle(chainId, actions);

  return deepFreeze({
    ...tx,
    action: {
      type: "irisClaim",
      args: { token, amount, receiver },
    },
  });
};

import type { ChainId } from "@iris-credit/core-sdk";
import type { Action } from "../../bundler/index.js";
import type { AuthorizationRequirementSignature } from "../../types/index.js";

import { isAddressEqual } from "viem";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { BundlerErrors } from "../../types/index.js";

/**
 * Encodes the bundler action that consumes a signed Iris authorization, granting
 * `authorized` (GeneralAdapter1) operator rights on behalf of the signer via
 * `setAuthorizationWithSig` — replacing a standalone `setAuthorization` transaction.
 *
 * The signature's `authorized` is pinned to the chain's `GeneralAdapter1`: an authorization
 * targeting any other account is rejected so the bundle can never hand operator rights over the
 * user's Iris positions to an unintended address. The action is emitted with `skipRevert: false`
 * so a rejected or stale authorization fails the whole bundle rather than letting a later
 * on-behalf Iris call revert opaquely.
 *
 * @param chainId - Chain whose `GeneralAdapter1` the signature must authorize.
 * @param signature - The signed authorization produced by `Requirement.sign()`.
 * @returns A single `irisSetAuthorizationWithSig` bundler `Action`.
 * @throws {BundlerErrors.UnexpectedSignature} when `signature.args.authorized` is not the chain's
 *   `GeneralAdapter1`.
 * @example
 * ```ts
 * import { getIrisAuthorizationAction } from "@iris-credit/iris-sdk";
 *
 * // `requirement` comes from `getIrisAuthorizationRequirement` with `supportSignature: true`.
 * const signed = await requirement.sign(walletClient, borrower);
 * const action = getIrisAuthorizationAction(1, signed);
 * // action satisfies { type: "irisSetAuthorizationWithSig"; args: [...] }
 * ```
 */
export const getIrisAuthorizationAction = (
  chainId: ChainId,
  signature: AuthorizationRequirementSignature,
): Action => {
  const { owner, authorized, isAuthorized, nonce, deadline } = signature.args;

  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  if (!isAddressEqual(authorized, generalAdapter1)) {
    throw new BundlerErrors.UnexpectedSignature(authorized);
  }

  return {
    type: "irisSetAuthorizationWithSig",
    args: [
      { authorizer: owner, authorized, isAuthorized, nonce, deadline },
      signature.args.signature,
      false /* skipRevert */,
    ],
  };
};

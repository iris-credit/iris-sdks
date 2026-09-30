import type { Address, Client, WalletClient } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type { AuthorizationRequirementSignature, Requirement } from "../../../types/index.js";

import { isAddressEqual, maxUint256 } from "viem";
import { signTypedData, verifyTypedData } from "viem/actions";
import { getAuthorizationTypedData, getChainAddresses } from "@iris-credit/core-sdk";
import { deepFreeze, Time } from "@iris-credit/iris-ts";
import { validateChainId, validateUserAddress } from "../../../helpers/index.js";
import {
  ExpiredDeadlineError,
  InputExceedsMaxError,
  InvalidSignatureError,
  NonPositiveInputError,
  UnsupportedAuthorizationOperatorError,
} from "../../../types/index.js";

/** Parameters for {@link encodeIrisSignatureAuthorization}. */
interface EncodeIrisSignatureAuthorizationParams {
  /** Account granting the authorization and signing it (the Iris `authorizer`). */
  owner: Address;
  /** Account to authorize on Iris; must be the chain's registered GeneralAdapter1. */
  authorized: Address;
  /** Target chain id; must match `viemClient.chain.id`. */
  chainId: ChainId;
  /** Authorization nonce: the signer's current `Iris.nonce(authorizer)`. */
  nonce: bigint;
  /** Whether to grant (`true`, default) or revoke (`false`) the authorization. */
  isAuthorized?: boolean;
  /** Signature deadline in seconds. Defaults to two hours from now. */
  deadline?: bigint;
}

/**
 * Builds an Iris authorization `Requirement` that, once signed, lets `authorized` operate on
 * Iris on the signer's behalf through `setAuthorizationWithSig` — the offchain-signature
 * alternative to a standalone `setAuthorization` transaction.
 *
 * The returned `Requirement.sign()` produces the EIP-712 signature over Iris's `Authorization`
 * typed data, verifies it against the connected account (via the client, so ERC-1271
 * smart-contract wallets are supported), and returns a deep-frozen `RequirementSignature` the
 * bundler action helpers consume. Iris authorization nonces are sequential per authorizer:
 * `setAuthorizationWithSig` accepts exactly `Iris.nonce(authorizer)` and increments it, so the
 * caller reads that value when building the requirement and at most one outstanding signature
 * per account is valid. The requirement's `action.typedData` holds the EIP-712 payload so it can
 * be inspected or displayed before signing. Deadline defaults to two hours from
 * `Time.timestamp()`.
 * The operator pin applies to grants and revocations alike: revoking a previously registered
 * operator is outside this helper's scope.
 *
 * @param viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId`.
 * @param params - Authorization encoding parameters.
 * @param params.owner - Account granting the authorization and signing it (the Iris `authorizer`).
 * @param params.authorized - Account to authorize; must be the chain's registered
 *   GeneralAdapter1, so a misconfigured `authorized` cannot grant an arbitrary address operator
 *   rights over the signer's Iris positions.
 * @param params.chainId - Target chain id.
 * @param params.nonce - Authorization nonce; the signer's current `Iris.nonce(authorizer)`.
 * @param params.isAuthorized - Grant (`true`, default) or revoke (`false`).
 * @param params.deadline - Optional signature deadline in seconds.
 * @returns A `Requirement` whose `action.typedData` is the EIP-712 payload and whose
 *   `sign(client, userAddress)` produces the deep-frozen signature.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`.
 * @throws {UnsupportedChainIdError} when `params.chainId` is absent from the address registry.
 * @throws {UnsupportedAuthorizationOperatorError} when `params.authorized` is not the chain's
 *   registered GeneralAdapter1.
 * @throws {NonPositiveInputError} when a provided `deadline` is not positive.
 * @throws {InputExceedsMaxError} when a provided `deadline` exceeds `uint256`.
 * @throws {ExpiredDeadlineError} when a provided `deadline` is positive but not in the future.
 * @throws {MissingClientPropertyError} from `sign()` when the client has no `account.address`.
 * @throws {AddressMismatchError} from `sign()` when `userAddress` differs from `owner`, or when the
 *   client account differs from `userAddress`.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
 * @example
 * ```ts
 * import { createWalletClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { encodeIrisSignatureAuthorization } from "@iris-credit/iris-sdk";
 *
 * const client = createWalletClient({ chain: mainnet, transport: http() });
 * const requirement = encodeIrisSignatureAuthorization(client, {
 *   owner,
 *   authorized: generalAdapter1,
 *   chainId: 1,
 *   nonce: user.nonce, // from `fetchUser`
 * });
 * // Inspect the EIP-712 payload (requirement.action.typedData) or sign via requirement.sign(...).
 * ```
 */
export const encodeIrisSignatureAuthorization = (
  viemClient: Client,
  params: EncodeIrisSignatureAuthorizationParams,
): Requirement<AuthorizationRequirementSignature> => {
  const { owner, authorized, chainId, nonce, isAuthorized = true } = params;

  validateChainId(viemClient.chain?.id, chainId);

  // Pin the authorized operator to the chain's registered GeneralAdapter1 so a direct caller cannot
  // be walked through signing an authorization that grants an arbitrary address operator rights
  // over the signer's Iris positions. `getIrisAuthorizationAction` enforces the same invariant, but
  // only once the signature is encoded into a bundle — after the wallet prompt. Applies to grant and
  // revoke payloads alike: the registry is pinned per release, so revoking a rotated-out operator is
  // outside this helper's scope.
  const {
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);
  if (!isAddressEqual(authorized, generalAdapter1)) {
    throw new UnsupportedAuthorizationOperatorError(authorized, chainId);
  }

  // Reject an invalid or already-expired caller-supplied deadline before signing, so a direct
  // caller is never walked through a wallet EIP-712 prompt for an authorization Iris would reject
  // with `SignatureExpired`. An omitted deadline defaults to two hours from now and is always valid.
  if (params.deadline != null) {
    if (params.deadline <= 0n) {
      throw new NonPositiveInputError("deadline", params.deadline);
    }
    if (params.deadline > maxUint256) {
      throw new InputExceedsMaxError({
        field: "deadline",
        value: params.deadline,
        max: maxUint256,
      });
    }
    const timestamp = Time.timestamp();
    if (params.deadline <= timestamp) {
      throw new ExpiredDeadlineError(params.deadline, timestamp);
    }
  }

  const deadline = params.deadline ?? Time.timestamp() + Time.s.from.h(2n);

  const typedData = deepFreeze(
    getAuthorizationTypedData(chainId, {
      authorizer: owner,
      authorized,
      isAuthorized,
      nonce,
      deadline,
    }),
  );

  const action: Requirement<AuthorizationRequirementSignature>["action"] = {
    type: "authorization",
    args: { authorized, isAuthorized, deadline },
    typedData,
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      // The authorizer is fixed at build time and embedded in the signed payload, so a different
      // signer cannot produce a valid authorization for it.
      validateUserAddress(userAddress, owner);
      const account = client.account;
      validateUserAddress(account?.address, userAddress);

      const signature = await signTypedData(client, {
        ...typedData,
        account,
      });

      const isValid = await verifyTypedData(viemClient, {
        ...typedData,
        address: userAddress, // Verify against the authorizer.
        signature,
      });

      if (!isValid) {
        throw new InvalidSignatureError();
      }

      return deepFreeze({
        args: {
          owner,
          authorized,
          isAuthorized,
          nonce,
          deadline,
          signature,
        },
        action,
      });
    },
  };
};

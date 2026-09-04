import type { Address, Client, WalletClient } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type {
  AuthorizationAction,
  AuthorizationRequirementSignature,
  Requirement,
} from "../../../types/index.js";

import { maxUint256 } from "viem";
import { signTypedData, verifyTypedData } from "viem/actions";
import { getAuthorizationTypedData, randomNonce } from "@iris-credit/core-sdk";
import { deepFreeze, Time } from "@iris-credit/iris-ts";
import { validateChainId, validateUserAddress } from "../../../helpers/index.js";
import {
  ExpiredDeadlineError,
  InputExceedsMaxError,
  InvalidSignatureError,
  NonPositiveInputError,
} from "../../../types/index.js";

/** Parameters for {@link encodeIrisSignatureAuthorization}. */
interface EncodeIrisSignatureAuthorizationParams {
  /** Account to authorize on Iris (GeneralAdapter1). */
  authorized: Address;
  /** Target chain id; must match `viemClient.chain.id`. */
  chainId: ChainId;
  /** Authorization nonce. Defaults to a random value. */
  nonce?: bigint;
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
 * bundler action helpers consume. Iris nonces are unordered, so the nonce defaults to a random
 * value instead of a fetched sequential one. Deadline defaults to two hours from
 * `Time.timestamp()`.
 *
 * @param viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId`.
 * @param params - Authorization encoding parameters.
 * @param params.authorized - Account to authorize (GeneralAdapter1).
 * @param params.chainId - Target chain id.
 * @param params.nonce - Optional authorization nonce; defaults to a random value.
 * @param params.isAuthorized - Grant (`true`, default) or revoke (`false`).
 * @param params.deadline - Optional signature deadline in seconds.
 * @returns A `Requirement` whose `sign(client, userAddress)` produces the deep-frozen signature.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`.
 * @throws {NonPositiveInputError} when a provided `deadline` is not positive.
 * @throws {InputExceedsMaxError} when a provided `deadline` exceeds `uint256`.
 * @throws {ExpiredDeadlineError} when a provided `deadline` is positive but not in the future.
 * @throws {MissingClientPropertyError} from `sign()` when the client has no `account.address`.
 * @throws {AddressMismatchError} from `sign()` when the client account differs from `userAddress`.
 * @throws {InvalidSignatureError} from `sign()` when EIP-712 verification fails.
 * @example
 * ```ts
 * import { createWalletClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { encodeIrisSignatureAuthorization } from "@iris-credit/iris-sdk";
 *
 * const client = createWalletClient({ chain: mainnet, transport: http() });
 * const requirement = encodeIrisSignatureAuthorization(client, {
 *   authorized: generalAdapter1,
 *   chainId: 1,
 * });
 * // requirement satisfies Requirement
 * ```
 */
export const encodeIrisSignatureAuthorization = (
  viemClient: Client,
  params: EncodeIrisSignatureAuthorizationParams,
): Requirement<AuthorizationRequirementSignature> => {
  const { authorized, chainId, nonce = randomNonce(), isAuthorized = true } = params;

  validateChainId(viemClient.chain?.id, chainId);

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

  const action: AuthorizationAction = {
    type: "authorization",
    args: { authorized, isAuthorized, deadline },
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      const account = client.account;
      validateUserAddress(account?.address, userAddress);

      const typedData = getAuthorizationTypedData(chainId, {
        authorizer: userAddress,
        authorized,
        isAuthorized,
        nonce,
        deadline,
      });

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
          owner: userAddress,
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

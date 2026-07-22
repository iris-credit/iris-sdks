import type { Address, Client } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type {
  AuthorizationRequirementSignature,
  IrisAuthorizationAction,
  Requirement,
  Transaction,
} from "../../../types/index.js";

import { encodeFunctionData, publicActions } from "viem";
import { getChainAddresses, irisAbi } from "@iris-credit/core-sdk";
import { deepFreeze } from "@iris-credit/iris-ts";
import { ChainIdMismatchError } from "../../../types/index.js";
import { encodeIrisSignatureAuthorization } from "../encode/index.js";

/**
 * Resolves whether `GeneralAdapter1` needs Iris authorization for the given user, and returns
 * the requirement to satisfy it when it does.
 *
 * Reads `Iris.isAuthorized(userAddress, generalAdapter1)` on the target chain. Required before
 * any bundled Iris path that operates on behalf of the user.
 *
 * - When `supportSignature` is falsy (default), returns the
 *   `setAuthorization(generalAdapter1, true)` transaction the user submits before the bundle.
 * - When `supportSignature` is `true`, returns a signable `Requirement`; the signed
 *   authorization is folded into the bundle via `setAuthorizationWithSig`, removing the
 *   standalone transaction. Iris authorization nonces are unordered, so no nonce read is
 *   needed — the requirement signs with a random nonce.
 *
 * @param params.viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId`.
 * @param params.chainId - Target chain id (used to resolve Iris and `GeneralAdapter1`).
 * @param params.userAddress - The user that must authorize `GeneralAdapter1`.
 * @param params.supportSignature - When `true`, return a signable `Requirement` instead of a
 *   transaction so authorization can be bundled via `setAuthorizationWithSig`.
 * @returns A deep-frozen `Transaction<IrisAuthorizationAction>`, a signable authorization
 *   `Requirement` (when `supportSignature` is `true`), or `null` when authorization is already in
 *   place.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`.
 * @example
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getIrisAuthorizationRequirement } from "@iris-credit/iris-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const requirement = await getIrisAuthorizationRequirement({
 *   viemClient: client,
 *   chainId: 1,
 *   userAddress: borrower,
 *   supportSignature: true,
 * });
 * // requirement is null when already authorized, a Requirement when supportSignature is true,
 * // otherwise Readonly<Transaction<IrisAuthorizationAction>>
 * ```
 */
export const getIrisAuthorizationRequirement = async (params: {
  viemClient: Client;
  chainId: ChainId;
  userAddress: Address;
  supportSignature?: boolean;
}): Promise<
  | Readonly<Transaction<IrisAuthorizationAction>>
  | Requirement<AuthorizationRequirementSignature>
  | null
> => {
  const { viemClient, chainId, userAddress, supportSignature } = params;

  if (viemClient.chain?.id !== chainId) {
    throw new ChainIdMismatchError(viemClient.chain?.id, chainId);
  }

  const {
    iris,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);

  const pc = viemClient.extend(publicActions);

  const isAuthorized = await pc.readContract({
    address: iris,
    abi: irisAbi,
    functionName: "isAuthorized",
    args: [userAddress, generalAdapter1],
  });

  if (isAuthorized) {
    return null;
  }

  if (supportSignature) {
    return encodeIrisSignatureAuthorization(viemClient, {
      authorized: generalAdapter1,
      chainId,
    });
  }

  return deepFreeze({
    to: iris,
    data: encodeFunctionData({
      abi: irisAbi,
      functionName: "setAuthorization",
      args: [generalAdapter1, true],
    }),
    value: 0n,
    action: {
      type: "irisAuthorization" as const,
      args: {
        authorized: generalAdapter1,
        isAuthorized: true,
      },
    },
  });
};

import type { Address } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";

import { isAddressEqual } from "viem";
import { getChainAddresses } from "@iris-credit/core-sdk";
import {
  AddressMismatchError,
  ChainIdMismatchError,
  MissingClientPropertyError,
  NativeAmountOnNonWNativeAssetError,
} from "../types/index.js";

/**
 * Asserts that the client's chain id matches the chain id the call targets.
 *
 * Throws {@link ChainIdMismatchError} on mismatch (including a client with no chain).
 *
 * @param clientChainId - The client's chain id, if any.
 * @param chainId - The chain id required by the call.
 */
export function validateChainId(clientChainId: number | undefined, chainId: number): void {
  if (clientChainId !== chainId) {
    throw new ChainIdMismatchError(clientChainId, chainId);
  }
}

/**
 * Asserts that the client has a connected account AND that it matches
 * the provided user address.
 *
 * Used internally by the signature requirements (`encodeErc20Permit`,
 * `encodeErc20Permit2Approve`, `encodeIrisSignatureAuthorization`) to enforce builder = signer
 * at `sign()` time:
 * the signing flow is the only path where an account/address mismatch
 * is a real security concern (rather than just an integrator footgun).
 *
 * Action-layer transaction builders do not call this helper — callers are
 * responsible for keeping `userAddress` aligned with the signing account
 * at the builder layer. Entity entrypoints reuse it for build-time
 * address-equality invariants (e.g. `Iris.take` requires `userAddress` to be
 * `quote.borrower`, the account that must sign the Iris authorization).
 *
 * Throws {@link MissingClientPropertyError} if the client has no account.
 * Throws {@link AddressMismatchError} if the client account differs from
 * `userAddress`.
 *
 * @param clientAccountAddress - The client's account address; if undefined,
 *   `MissingClientPropertyError` is thrown.
 * @param userAddress - The user address provided by the caller.
 */
export function validateUserAddress(
  clientAccountAddress: Address | undefined,
  userAddress: Address,
): asserts clientAccountAddress is Address {
  if (clientAccountAddress === undefined) {
    throw new MissingClientPropertyError("account");
  }
  if (!isAddressEqual(clientAccountAddress, userAddress)) {
    throw new AddressMismatchError(clientAccountAddress, userAddress);
  }
}

/**
 * Asserts that `asset` is the chain's wrapped native token — the only asset a native amount
 * can fund, since the bundle wraps the native token before the pull.
 *
 * Throws {@link NativeAmountOnNonWNativeAssetError} if the asset is not wNative.
 *
 * @param chainId - Chain whose wNative the asset must match.
 * @param asset - The asset a native amount was supplied for.
 */
export function validateNativeAsset(chainId: ChainId, asset: Address): void {
  const { wNative } = getChainAddresses(chainId);
  if (!isAddressEqual(asset, wNative)) {
    throw new NativeAmountOnNonWNativeAssetError(asset, wNative);
  }
}

import type { Address, Client } from "viem";
import type { BigIntish, FetchParameters } from "../../types.js";

import { getChainId, readContract } from "viem/actions";
import { irisAbi } from "../../abis/iris.js";
import { getChainAddresses } from "../../addresses.js";
import { ChainUtils } from "../../chain.js";
import { UnsupportedChainIdError } from "../../errors.js";
import { User } from "./User.js";

/**
 * Fetches a user's Iris bundler authorization state. Returns `false` without a contract read when
 * the chain has no deployed general adapter configured.
 *
 * @param address - User address to fetch.
 * @param client - Viem client used for the contract read.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `User` entity.
 */
export async function fetchUser(
  address: Address,
  client: Client,
  parameters: FetchParameters = {},
) {
  const chainId = parameters.chainId ?? (await getChainId(client));
  if (!ChainUtils.isSupportedChainId(chainId)) throw new UnsupportedChainIdError(chainId);

  const chainAddresses = getChainAddresses(chainId);

  const isBundlerAuthorized = await readContract(client, {
    ...parameters,
    address: chainAddresses.iris,
    abi: irisAbi,
    functionName: "isAuthorized",
    args: [address, chainAddresses.bundler3.generalAdapter1],
  });

  return new User({ address, isBundlerAuthorized });
}

/**
 * Fetches whether an account has used a nonce on Iris.
 *
 * `take` and `setAuthorizationWithSig` consume nonces, so a quote whose `(solver, nonce)` pair
 * is already used is unsubmittable.
 *
 * @param authorizer - Account owning the nonce (e.g. `quote.solver`).
 * @param nonce - Nonce to look up.
 * @param client - Viem client used for the read.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns Whether `authorizer` has used `nonce`.
 */
export async function fetchIsNonceUsed(
  authorizer: Address,
  nonce: BigIntish,
  client: Client,
  parameters: FetchParameters = {},
) {
  const chainId = parameters.chainId ?? (await getChainId(client));
  if (!ChainUtils.isSupportedChainId(chainId)) throw new UnsupportedChainIdError(chainId);

  const { iris } = getChainAddresses(chainId);

  return await readContract(client, {
    ...parameters,
    address: iris,
    abi: irisAbi,
    functionName: "isNonceUsed",
    args: [authorizer, BigInt(nonce)],
  });
}

/**
 * Fetches the balance an account can claim from Iris for one token.
 *
 * Settlement credits the solver's net and surplus, and the fee recipient's fees, to this balance.
 * `Iris.claim` debits an exact amount from it — there is no max-sweep sentinel — so a claim has to
 * be sized against this read.
 *
 * @param account - Account owning the claimable balance (e.g. a loan's solver).
 * @param token - Token the balance is denominated in.
 * @param client - Viem client used for the read.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The claimable balance of `account` for `token`.
 */
export async function fetchClaimable(
  account: Address,
  token: Address,
  client: Client,
  parameters: FetchParameters = {},
) {
  const chainId = parameters.chainId ?? (await getChainId(client));
  if (!ChainUtils.isSupportedChainId(chainId)) throw new UnsupportedChainIdError(chainId);

  const { iris } = getChainAddresses(chainId);

  return await readContract(client, {
    ...parameters,
    address: iris,
    abi: irisAbi,
    functionName: "claimable",
    args: [token, account],
  });
}

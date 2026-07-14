import type { Address, Client } from "viem";
import type { FetchParameters } from "../../types.js";

import { getAddress } from "viem";
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
  address = getAddress(address);

  const isBundlerAuthorized = await readContract(client, {
    ...parameters,
    address: chainAddresses.iris,
    abi: irisAbi,
    functionName: "isAuthorized",
    args: [address, chainAddresses.bundler3.generalAdapter1],
  });

  return new User({ address, isBundlerAuthorized });
}

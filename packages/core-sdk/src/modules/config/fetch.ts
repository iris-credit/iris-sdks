import type { Address, Client, Hex } from "viem";
import type { BigIntish, FetchParameters } from "../../types.js";

import { keccak256 } from "viem";
import { getChainId, readContract } from "viem/actions";
import { irisAbi } from "../../abis/iris.js";
import { getChainAddresses } from "../../addresses.js";
import { ChainUtils } from "../../chain.js";
import { BP } from "../../constants.js";
import { UnsupportedChainIdError } from "../../errors.js";
import { Config } from "./Config.js";

/**
 * Fetches the mutable protocol-level Iris configuration.
 *
 * The contract stores the fee as a BP-compressed `uint16`. This fetcher restores it to the
 * WAD-scaled convention used by `Loan` and the indexer. Both reads are issued concurrently.
 *
 * @param client - Viem client used for the reads.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `Config` entity.
 * @example
 * ```ts
 * import { Config, fetchConfig } from "@iris-credit/core-sdk";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 *
 * const config: Config = await fetchConfig(client);
 * ```
 */
export async function fetchConfig(client: Client, parameters: FetchParameters = {}) {
  const chainId = parameters.chainId ?? (await getChainId(client));
  if (!ChainUtils.isSupportedChainId(chainId)) throw new UnsupportedChainIdError(chainId);

  const { iris } = getChainAddresses(chainId);
  const call = { ...parameters, address: iris, abi: irisAbi } as const;

  const [fee, feeRecipient] = await Promise.all([
    readContract(client, { ...call, functionName: "fee" }),
    readContract(client, { ...call, functionName: "feeRecipient" }),
  ]);

  return new Config({ fee: BigInt(fee) * BP, feeRecipient });
}

/**
 * Fetches whether a BLM is enabled on Iris.
 *
 * `take` reverts for quotes referencing a non-enabled BLM. Enablement is append-only onchain
 * (there is no disable path), so a `true` result never becomes stale.
 *
 * @param blm - BLM address to look up (e.g. `quote.blm`).
 * @param client - Viem client used for the read.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns Whether `blm` is enabled.
 */
export async function fetchIsBlmEnabled(
  blm: Address,
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
    functionName: "isBlmEnabled",
    args: [blm],
  });
}

/**
 * Fetches whether a bond LLTV is enabled on Iris.
 *
 * `take` reverts for quotes with a non-enabled bond LLTV. Enablement is append-only onchain
 * (there is no disable path), so a `true` result never becomes stale.
 *
 * @param lltv - WAD-scaled bond LLTV to look up, exactly as carried by `quote.bondLltv`.
 * @param client - Viem client used for the read.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns Whether `lltv` is enabled.
 */
export async function fetchIsBondLltvEnabled(
  lltv: BigIntish,
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
    functionName: "isBondLltvEnabled",
    args: [BigInt(lltv)],
  });
}

/**
 * Fetches whether a market data payload is enabled on Iris.
 *
 * Takes the raw `quote.data` bytes and hashes them with `keccak256` before the read, mirroring
 * the contract's `isDataEnabled[keccak256(quote.data)]` check at `take` — pass the payload, not
 * its hash. Enablement is append-only onchain (there is no disable path), so a `true` result
 * never becomes stale.
 *
 * @param data - Raw market data bytes (e.g. `quote.data`); `0x` for venues that ignore data.
 * @param client - Viem client used for the read.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns Whether `data` is enabled.
 */
export async function fetchIsDataEnabled(
  data: Hex,
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
    functionName: "isDataEnabled",
    args: [keccak256(data)],
  });
}

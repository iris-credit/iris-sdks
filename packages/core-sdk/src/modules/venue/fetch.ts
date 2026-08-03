import type { Address, Client, Hex } from "viem";
import type { BigIntish, FetchParameters } from "../../types.js";
import type { Venue } from "./Venue.js";

import { zeroAddress } from "viem";
import { getBlock, getChainId, readContract } from "viem/actions";
import { irisAbi } from "../../abis/iris.js";
import { venueAdapterAbi } from "../../abis/venueAdapter.js";
import { getChainAddresses } from "../../addresses.js";
import { ChainUtils } from "../../chain.js";
import { UnsupportedChainIdError, UnsupportedVenueAdapterError } from "../../errors.js";
import { fetchAaveV3Venue } from "./aaveV3/fetch.js";
import { fetchMorphoBlueVenue } from "./morphoBlue/fetch.js";

/** Parameters identifying the venue backing a loan (all read from its position and loan). */
export interface FetchVenueArgs {
  /** The pod holding the position on the venue. */
  pod: Address;
  /** The position's venue id. */
  venueId: BigIntish;
  /** The position's venue-specific market data (e.g. ABI-encoded Morpho market params). */
  data: Hex;
  /** The loan's collateral token. */
  collateralToken: Address;
  /** The loan's debt token. */
  debtToken: Address;
}

/**
 * Fetches the venue's live view of a pod — assets, indices, LLTV and price, read from the
 * venue adapter at the fetched block — hydrated with the rate model matching its venue
 * adapter, so indices can also be projected offline to an arbitrary timestamp.
 *
 * Resolves the venue adapter from Iris, then dispatches:
 *
 * - **Morpho Blue adapter** — delegates to {@link fetchMorphoBlueVenue} for the market
 *   state, the pod's position primitives and the IRM's `rateAtTarget`.
 * - **Aave V3 adapter** — delegates to {@link fetchAaveV3Venue} for the collateral and
 *   debt reserves.
 *
 * @param args - See {@link FetchVenueArgs}.
 * @param client - Viem client used for the contract reads.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `Venue` entity; narrow to a concrete venue with `instanceof`.
 * @throws {UnsupportedChainIdError} when the chain has no registered addresses.
 * @throws {UnsupportedVenueAdapterError} when no venue adapter is registered for the venue
 *   id or the adapter has no offline rate model.
 * @example
 * ```ts
 * import { AaveV3Venue, fetchVenue } from "@iris-credit/core-sdk";
 *
 * const venue = await fetchVenue(
 *   {
 *     pod: position.pod,
 *     venueId: position.venueId,
 *     data: position.data,
 *     collateralToken: loan.collateralToken,
 *     debtToken: loan.debtToken,
 *   },
 *   client,
 * );
 *
 * if (venue instanceof AaveV3Venue) console.log(venue.collateralReserve);
 * ```
 */
export async function fetchVenue(
  { pod, venueId, data, collateralToken, debtToken }: FetchVenueArgs,
  client: Client,
  parameters: FetchParameters = {},
): Promise<Venue> {
  const chainId = parameters.chainId ?? (await getChainId(client));
  if (!ChainUtils.isSupportedChainId(chainId)) throw new UnsupportedChainIdError(chainId);

  const { iris, morphoBlueAdapter, aaveV3Adapter } = getChainAddresses(chainId);

  const adapter = await readContract(client, {
    ...parameters,
    address: iris,
    abi: irisAbi,
    functionName: "venueAdapter",
    args: [BigInt(venueId)],
  });
  // An unregistered venue id resolves to the zero address.
  if (adapter === zeroAddress) {
    throw new UnsupportedVenueAdapterError(adapter, chainId);
  }

  const [[collateral, debt], [collateralIndex, debtIndex], lltv, price, block] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: adapter,
      abi: venueAdapterAbi,
      functionName: "positionAssets",
      args: [pod, collateralToken, debtToken, data],
    }),
    readContract(client, {
      ...parameters,
      address: adapter,
      abi: venueAdapterAbi,
      functionName: "indices",
      args: [collateralToken, debtToken, data],
    }),
    readContract(client, {
      ...parameters,
      address: adapter,
      abi: venueAdapterAbi,
      functionName: "lltv",
      args: [collateralToken, debtToken, data],
    }),
    readContract(client, {
      ...parameters,
      address: adapter,
      abi: venueAdapterAbi,
      functionName: "price",
      args: [collateralToken, debtToken, data],
    }),
    getBlock(
      client,
      parameters.blockNumber != null
        ? { blockNumber: parameters.blockNumber }
        : { blockTag: parameters.blockTag ?? "latest" },
    ),
  ]);
  const venue = {
    id: BigInt(venueId),
    data,
    pod,
    collateral,
    debt,
    collateralIndex,
    debtIndex,
    lltv,
    price,
    lastUpdate: block.timestamp,
  };

  // Chain addresses are checksum validated by lint.
  switch (adapter) {
    case morphoBlueAdapter:
      return fetchMorphoBlueVenue(venue, { pod, data }, client, { ...parameters, chainId });
    case aaveV3Adapter:
      return fetchAaveV3Venue(venue, { collateralToken, debtToken }, client, {
        ...parameters,
        chainId,
      });
    default:
      throw new UnsupportedVenueAdapterError(adapter, chainId);
  }
}

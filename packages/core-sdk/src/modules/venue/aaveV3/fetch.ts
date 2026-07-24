import type { Address, Client } from "viem";
import type { FetchParameters } from "../../../types.js";
import type { IVenue } from "../Venue.js";

import { getChainId, readContract } from "viem/actions";
import { aaveV3PoolAbi } from "../../../abis/aaveV3.js";
import { getChainAddresses } from "../../../addresses.js";
import { ChainUtils } from "../../../chain.js";
import { UnsupportedChainIdError } from "../../../errors.js";
import { AaveV3Venue } from "./AaveV3Venue.js";

/** Parameters identifying the loan's Aave V3 reserves. */
export interface FetchAaveV3VenueArgs {
  /** The loan's collateral token. */
  collateralToken: Address;
  /** The loan's debt token. */
  debtToken: Address;
}

/**
 * Fetches the Aave V3 state backing a venue's view of a pod: the collateral and debt
 * reserves' indices, rates and last update timestamps.
 *
 * @param venue - The venue's live view of the pod, read from the venue adapter.
 * @param args - See {@link FetchAaveV3VenueArgs}.
 * @param client - Viem client used for the contract reads.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `AaveV3Venue` entity.
 */
export async function fetchAaveV3Venue(
  venue: IVenue,
  { collateralToken, debtToken }: FetchAaveV3VenueArgs,
  client: Client,
  parameters: FetchParameters = {},
) {
  const chainId = parameters.chainId ?? (await getChainId(client));
  if (!ChainUtils.isSupportedChainId(chainId)) throw new UnsupportedChainIdError(chainId);

  const { aaveV3Pool } = getChainAddresses(chainId);

  const [collateralReserve, debtReserve] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: aaveV3Pool,
      abi: aaveV3PoolAbi,
      functionName: "getReserveData",
      args: [collateralToken],
    }),
    readContract(client, {
      ...parameters,
      address: aaveV3Pool,
      abi: aaveV3PoolAbi,
      functionName: "getReserveData",
      args: [debtToken],
    }),
  ]);

  return new AaveV3Venue(
    venue,
    {
      index: collateralReserve.liquidityIndex,
      rate: collateralReserve.currentLiquidityRate,
      lastUpdateTimestamp: BigInt(collateralReserve.lastUpdateTimestamp),
    },
    {
      index: debtReserve.variableBorrowIndex,
      rate: debtReserve.currentVariableBorrowRate,
      lastUpdateTimestamp: BigInt(debtReserve.lastUpdateTimestamp),
    },
  );
}

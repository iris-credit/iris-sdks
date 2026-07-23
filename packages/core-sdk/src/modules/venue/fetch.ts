import type { Address, Client, Hex } from "viem";
import type { BigIntish, FetchParameters } from "../../types.js";
import type { Venue } from "./Venue.js";

import { decodeAbiParameters, encodeAbiParameters, isAddressEqual, keccak256 } from "viem";
import { getChainId, readContract } from "viem/actions";
import { aaveV3PoolAbi } from "../../abis/aaveV3.js";
import { irisAbi } from "../../abis/iris.js";
import { morphoBlueAbi, morphoIrmAbi, morphoMarketParamsAbi } from "../../abis/morphoBlue.js";
import { getChainAddresses } from "../../addresses.js";
import { ChainUtils } from "../../chain.js";
import { UnsupportedChainIdError, UnsupportedVenueAdapterError } from "../../errors.js";
import { AaveV3Venue } from "./AaveV3Venue.js";
import { MorphoBlueVenue } from "./MorphoBlueVenue.js";

/** Parameters identifying the venue backing a loan (all read from its position and loan). */
export interface FetchVenueArgs {
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
 * Fetches the state of the venue backing a loan, hydrated with the rate model matching its
 * venue adapter — so indices can be projected offline to an arbitrary timestamp.
 *
 * Resolves the venue adapter from Iris, then dispatches:
 *
 * - **Morpho Blue adapter** — decodes the market params from `data` and reads the market state
 *   and the IRM's `borrowRateView`, returning a {@link MorphoBlueVenue}.
 * - **Aave V3 adapter** — reads the collateral and debt reserves, returning an
 *   {@link AaveV3Venue}.
 *
 * @param args - See {@link FetchVenueArgs}.
 * @param client - Viem client used for the contract reads.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `Venue` entity.
 * @throws {UnsupportedChainIdError} when the chain has no registered addresses.
 * @throws {UnsupportedVenueAdapterError} when the venue adapter has no offline rate model.
 */
export async function fetchVenue(
  { venueId, data, collateralToken, debtToken }: FetchVenueArgs,
  client: Client,
  parameters: FetchParameters = {},
): Promise<Venue> {
  const chainId = parameters.chainId ?? (await getChainId(client));
  if (!ChainUtils.isSupportedChainId(chainId)) throw new UnsupportedChainIdError(chainId);

  const { iris, morphoBlueAdapter, morphoBlue, aaveV3Adapter, aaveV3Pool } =
    getChainAddresses(chainId);

  const adapter = await readContract(client, {
    ...parameters,
    address: iris,
    abi: irisAbi,
    functionName: "venueAdapter",
    args: [BigInt(venueId)],
  });

  if (isAddressEqual(adapter, morphoBlueAdapter)) {
    const [marketParams] = decodeAbiParameters(morphoMarketParamsAbi, data);
    const id = keccak256(encodeAbiParameters(morphoMarketParamsAbi, [marketParams]));

    const [
      totalSupplyAssets,
      totalSupplyShares,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      fee,
    ] = await readContract(client, {
      ...parameters,
      address: morphoBlue,
      abi: morphoBlueAbi,
      functionName: "market",
      args: [id],
    });

    const borrowRate = await readContract(client, {
      ...parameters,
      address: marketParams.irm,
      abi: morphoIrmAbi,
      functionName: "borrowRateView",
      args: [
        marketParams,
        {
          totalSupplyAssets,
          totalSupplyShares,
          totalBorrowAssets,
          totalBorrowShares,
          lastUpdate,
          fee,
        },
      ],
    });

    return new MorphoBlueVenue({
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      borrowRate,
    });
  }

  if (isAddressEqual(adapter, aaveV3Adapter)) {
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

    return new AaveV3Venue({
      collateralReserve: {
        index: collateralReserve.liquidityIndex,
        rate: collateralReserve.currentLiquidityRate,
        lastUpdateTimestamp: BigInt(collateralReserve.lastUpdateTimestamp),
      },
      debtReserve: {
        index: debtReserve.variableBorrowIndex,
        rate: debtReserve.currentVariableBorrowRate,
        lastUpdateTimestamp: BigInt(debtReserve.lastUpdateTimestamp),
      },
    });
  }

  throw new UnsupportedVenueAdapterError(adapter, chainId);
}

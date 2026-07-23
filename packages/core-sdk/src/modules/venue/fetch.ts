import type { Address, Client, Hex } from "viem";
import type { BigIntish, FetchParameters } from "../../types.js";
import type { Venue } from "./Venue.js";

import { decodeAbiParameters, encodeAbiParameters, isAddressEqual, keccak256 } from "viem";
import { getChainId, readContract } from "viem/actions";
import { aaveV3PoolAbi } from "../../abis/aaveV3.js";
import { irisAbi } from "../../abis/iris.js";
import {
  adaptiveCurveIrmAbi,
  morphoBlueAbi,
  morphoMarketParamsAbi,
} from "../../abis/morphoBlue.js";
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
 * - **Morpho Blue adapter** — decodes the market params from `data` and reads the market state,
 *   plus the Adaptive Curve IRM's `rateAtTarget` when the market uses it, returning a
 *   {@link MorphoBlueVenue}.
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

  const { iris, morphoBlueAdapter, morphoBlue, adaptiveCurveIrm, aaveV3Adapter, aaveV3Pool } =
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

    const [totalSupplyAssets, , totalBorrowAssets, totalBorrowShares, lastUpdate] =
      await readContract(client, {
        ...parameters,
        address: morphoBlue,
        abi: morphoBlueAbi,
        functionName: "market",
        args: [id],
      });

    // Only the canonical Adaptive Curve IRM exposes its state; markets on any other IRM
    // accrue at a zero rate offline (see `MorphoBlueVenue.indices`).
    const rateAtTarget = isAddressEqual(marketParams.irm, adaptiveCurveIrm)
      ? await readContract(client, {
          ...parameters,
          address: adaptiveCurveIrm,
          abi: adaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [id],
        })
      : undefined;

    return new MorphoBlueVenue({
      totalSupplyAssets,
      totalBorrowAssets,
      totalBorrowShares,
      lastUpdate,
      rateAtTarget,
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

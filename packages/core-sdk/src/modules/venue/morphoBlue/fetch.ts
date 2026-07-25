import type { Address, Client, Hex } from "viem";
import type { FetchParameters } from "../../../types.js";
import type { IVenue } from "../Venue.js";

import { decodeAbiParameters, encodeAbiParameters, isAddressEqual, keccak256 } from "viem";
import { getChainId, readContract } from "viem/actions";
import {
  adaptiveCurveIrmAbi,
  morphoBlueAbi,
  morphoMarketParamsAbi,
} from "../../../abis/morphoBlue.js";
import { getChainAddresses } from "../../../addresses.js";
import { ChainUtils } from "../../../chain.js";
import { UnsupportedChainIdError } from "../../../errors.js";
import { MorphoBlueVenue } from "./MorphoBlueVenue.js";

/** Parameters identifying the pod's Morpho Blue market position. */
export interface FetchMorphoBlueVenueArgs {
  /** The pod holding the position on the market. */
  pod: Address;
  /** The position's venue-specific market data (ABI-encoded Morpho market params). */
  data: Hex;
}

/**
 * Fetches the Morpho Blue state backing a venue's view of a pod: the market state, the
 * pod's position primitives, and the Adaptive Curve IRM's `rateAtTarget` when the market
 * uses it.
 *
 * @param venue - The venue's live view of the pod, read from the venue adapter.
 * @param args - See {@link FetchMorphoBlueVenueArgs}.
 * @param client - Viem client used for the contract reads.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `MorphoBlueVenue` entity.
 */
export async function fetchMorphoBlueVenue(
  venue: IVenue,
  { pod, data }: FetchMorphoBlueVenueArgs,
  client: Client,
  parameters: FetchParameters = {},
) {
  const chainId = parameters.chainId ?? (await getChainId(client));
  if (!ChainUtils.isSupportedChainId(chainId)) throw new UnsupportedChainIdError(chainId);

  const { morphoBlue, adaptiveCurveIrm } = getChainAddresses(chainId);

  const [marketParams] = decodeAbiParameters(morphoMarketParamsAbi, data);
  const id = keccak256(encodeAbiParameters(morphoMarketParamsAbi, [marketParams]));

  const [
    [totalSupplyAssets, , totalBorrowAssets, totalBorrowShares, lastUpdate],
    [, borrowShares, collateral],
    rateAtTarget,
  ] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: morphoBlue,
      abi: morphoBlueAbi,
      functionName: "market",
      args: [id],
    }),
    readContract(client, {
      ...parameters,
      address: morphoBlue,
      abi: morphoBlueAbi,
      functionName: "position",
      args: [id, pod],
    }),
    // Only the canonical Adaptive Curve IRM exposes its state; markets on any other IRM
    // accrue at a zero rate offline (see `MorphoBlueVenue.accrueInterest`).
    isAddressEqual(marketParams.irm, adaptiveCurveIrm)
      ? readContract(client, {
          ...parameters,
          address: adaptiveCurveIrm,
          abi: adaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [id],
        })
      : undefined,
  ]);

  return new MorphoBlueVenue(
    venue,
    { totalSupplyAssets, totalBorrowAssets, totalBorrowShares, lastUpdate },
    { borrowShares, collateral },
    rateAtTarget,
  );
}

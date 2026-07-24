import type { Address, Client } from "viem";
import type { FetchParameters } from "../../types.js";

import { getChainId, readContract } from "viem/actions";
import { irisAbi } from "../../abis/iris.js";
import { getChainAddresses } from "../../addresses.js";
import { ChainUtils } from "../../chain.js";
import { UnsupportedChainIdError } from "../../errors.js";
import { fetchLoan } from "../loan/fetch.js";
import { fetchVenue } from "../venue/fetch.js";
import { AccrualPosition, Position } from "./Position.js";

/**
 * Fetches an Iris position by Pod address.
 *
 * Returns the stored `Position` state as of its `lastUpdate` — legs and indices are not
 * accrued to the current block. Compose with {@link fetchAccrualPosition} for accrual-ready
 * state. A pod with no loan returns a zeroed position (`lastUpdate === 0n`).
 *
 * @param pod - Pod address identifying the position.
 * @param client - Viem client used for the contract read.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `Position` entity.
 */
export async function fetchPosition(
  pod: Address,
  client: Client,
  parameters: FetchParameters = {},
) {
  const chainId = parameters.chainId ?? (await getChainId(client));
  if (!ChainUtils.isSupportedChainId(chainId)) throw new UnsupportedChainIdError(chainId);

  const { iris } = getChainAddresses(chainId);

  const position = await readContract(client, {
    ...parameters,
    address: iris,
    abi: irisAbi,
    functionName: "getPosition",
    args: [pod],
  });

  return new Position({
    ...position,
    pod,
    lastUpdate: BigInt(position.lastUpdate),
    venueId: BigInt(position.venueId),
  });
}

/**
 * Fetches a position paired with its loan and its venue, ready for accrual math at arbitrary
 * timestamps.
 *
 * Two-phase read: the stored position and loan first (the venue is identified by the
 * position's `venueId` / `data` and the loan's tokens), then the venue's live view of the
 * pod with its rate model (see {@link fetchVenue}). Accrue with `accrueLegs(timestamp)`.
 *
 * @param pod - Pod address identifying the position.
 * @param client - Viem client used for the contract reads.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `AccrualPosition` entity.
 * @throws {UnsupportedVenueAdapterError} from `fetchVenue` when the position's venue adapter
 *   has no offline rate model.
 * @example
 * ```ts
 * import { fetchAccrualPosition } from "@iris-credit/core-sdk";
 * import { Time } from "@iris-credit/iris-ts";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 *
 * const position = await fetchAccrualPosition(pod, client);
 * const accrued = position.accrueLegs(Time.timestamp());
 * ```
 */
export async function fetchAccrualPosition(
  pod: Address,
  client: Client,
  parameters: FetchParameters = {},
) {
  const chainId = parameters.chainId ?? (await getChainId(client));
  if (!ChainUtils.isSupportedChainId(chainId)) throw new UnsupportedChainIdError(chainId);

  const [position, loan] = await Promise.all([
    fetchPosition(pod, client, { ...parameters, chainId }),
    fetchLoan(pod, client, { ...parameters, chainId }),
  ]);

  const venue = await fetchVenue(
    {
      pod,
      venueId: position.venueId,
      data: position.data,
      collateralToken: loan.collateralToken,
      debtToken: loan.debtToken,
    },
    client,
    { ...parameters, chainId },
  );

  return new AccrualPosition(position, loan, venue);
}

import type { Address, Client } from "viem";
import type { FetchParameters } from "../../../types.js";
import type { IVenue } from "../Venue.js";

import { erc20Abi } from "viem";
import { getChainId, readContract } from "viem/actions";
import {
  aaveV3ATokenAbi,
  aaveV3OracleAbi,
  aaveV3PoolAbi,
  aaveV3VariableDebtTokenAbi,
} from "../../../abis/aaveV3.js";
import { getAToken, getChainAddresses, getVToken } from "../../../addresses.js";
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
 * reserves' indices, rates, last update timestamps, configuration and oracle prices,
 * plus the token-level supply and liquidity data the borrow and supply bounds need.
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

  const { aaveV3Pool, aaveV3Oracle } = getChainAddresses(chainId);
  const debtAToken = getAToken(debtToken, chainId);

  const [
    collateralReserve,
    debtReserve,
    collateralPrice,
    debtPrice,
    collateralATokenScaledTotalSupply,
    collateralVTokenScaledTotalSupply,
    debtATokenScaledTotalSupply,
    debtVTokenScaledTotalSupply,
    debtUnderlyingBalance,
    debtVirtualUnderlyingBalance,
  ] = await Promise.all([
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
    readContract(client, {
      ...parameters,
      address: aaveV3Oracle,
      abi: aaveV3OracleAbi,
      functionName: "getAssetPrice",
      args: [collateralToken],
    }),
    readContract(client, {
      ...parameters,
      address: aaveV3Oracle,
      abi: aaveV3OracleAbi,
      functionName: "getAssetPrice",
      args: [debtToken],
    }),
    readContract(client, {
      ...parameters,
      address: getAToken(collateralToken, chainId),
      abi: aaveV3ATokenAbi,
      functionName: "scaledTotalSupply",
    }),
    readContract(client, {
      ...parameters,
      address: getVToken(collateralToken, chainId),
      abi: aaveV3VariableDebtTokenAbi,
      functionName: "scaledTotalSupply",
    }),
    readContract(client, {
      ...parameters,
      address: debtAToken,
      abi: aaveV3ATokenAbi,
      functionName: "scaledTotalSupply",
    }),
    readContract(client, {
      ...parameters,
      address: getVToken(debtToken, chainId),
      abi: aaveV3VariableDebtTokenAbi,
      functionName: "scaledTotalSupply",
    }),
    readContract(client, {
      ...parameters,
      address: debtToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [debtAToken],
    }),
    readContract(client, {
      ...parameters,
      address: aaveV3Pool,
      abi: aaveV3PoolAbi,
      functionName: "getVirtualUnderlyingBalance",
      args: [debtToken],
    }),
  ]);

  return new AaveV3Venue(
    venue,
    {
      configuration: collateralReserve.configuration.data,
      liquidityIndex: collateralReserve.liquidityIndex,
      currentLiquidityRate: collateralReserve.currentLiquidityRate,
      variableBorrowIndex: collateralReserve.variableBorrowIndex,
      currentVariableBorrowRate: collateralReserve.currentVariableBorrowRate,
      lastUpdateTimestamp: BigInt(collateralReserve.lastUpdateTimestamp),
      accruedToTreasury: collateralReserve.accruedToTreasury,
    },
    {
      configuration: debtReserve.configuration.data,
      liquidityIndex: debtReserve.liquidityIndex,
      currentLiquidityRate: debtReserve.currentLiquidityRate,
      variableBorrowIndex: debtReserve.variableBorrowIndex,
      currentVariableBorrowRate: debtReserve.currentVariableBorrowRate,
      lastUpdateTimestamp: BigInt(debtReserve.lastUpdateTimestamp),
      accruedToTreasury: debtReserve.accruedToTreasury,
    },
    {
      price: collateralPrice,
      aTokenScaledTotalSupply: collateralATokenScaledTotalSupply,
      vTokenScaledTotalSupply: collateralVTokenScaledTotalSupply,
    },
    {
      price: debtPrice,
      aTokenScaledTotalSupply: debtATokenScaledTotalSupply,
      vTokenScaledTotalSupply: debtVTokenScaledTotalSupply,
      underlyingBalance: debtUnderlyingBalance,
      virtualUnderlyingBalance: debtVirtualUnderlyingBalance,
    },
  );
}

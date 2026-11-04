import type { Address, Client } from "viem";
import type { FetchParameters } from "../../../types.js";
import type { IVenue } from "../Venue.js";

import { erc20Abi } from "viem";
import { getChainId, readContract } from "viem/actions";
import {
  aaveV3ATokenAbi,
  aaveV3OracleAbi,
  aaveV3VariableDebtTokenAbi,
} from "../../../abis/aaveV3.js";
import { sparkLendPoolAbi } from "../../../abis/sparkLend.js";
import { getChainAddresses, getSparkLendSpToken, getSparkLendVToken } from "../../../addresses.js";
import { ChainUtils } from "../../../chain.js";
import { UnsupportedChainIdError } from "../../../errors.js";
import { SparkLendVenue } from "./SparkLendVenue.js";

/** Parameters identifying the loan's SparkLend reserves. */
export interface FetchSparkLendVenueArgs {
  /** The loan's collateral token. */
  collateralToken: Address;
  /** The loan's debt token. */
  debtToken: Address;
}

/**
 * Fetches the SparkLend state backing a venue's view of a pod: the collateral and debt reserves'
 * indices, rates, last update timestamps, configuration and oracle prices, plus the token-level
 * supply and liquidity data the borrow and supply bounds need. SparkLend has no virtual
 * accounting, so the debt reserve's liquidity is the underlying its spToken holds.
 *
 * @param venue - The venue's live view of the pod, read from the venue adapter.
 * @param args - See {@link FetchSparkLendVenueArgs}.
 * @param client - Viem client used for the contract reads.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `SparkLendVenue` entity.
 * @throws {UnsupportedChainIdError} when the chain has no registered addresses.
 * @throws {UnsupportedSparkLendTokenError} when a loan token has no registered SparkLend reserve.
 * @example
 * ```ts
 * import { fetchSparkLendVenue } from "@iris-credit/core-sdk";
 *
 * const venue = await fetchSparkLendVenue(view, { collateralToken: WETH, debtToken: USDC }, client);
 *
 * venue.getMaxBorrowAmount(10n ** 18n); // The USDC 1 WETH can borrow on SparkLend.
 * ```
 */
export async function fetchSparkLendVenue(
  venue: IVenue,
  { collateralToken, debtToken }: FetchSparkLendVenueArgs,
  client: Client,
  parameters: FetchParameters = {},
) {
  const chainId = parameters.chainId ?? (await getChainId(client));
  if (!ChainUtils.isSupportedChainId(chainId)) throw new UnsupportedChainIdError(chainId);

  const { sparkLendPool, sparkLendOracle } = getChainAddresses(chainId);

  const [
    collateralReserve,
    debtReserve,
    collateralPrice,
    debtPrice,
    collateralSpTokenScaledTotalSupply,
    collateralVTokenScaledTotalSupply,
    debtVTokenScaledTotalSupply,
    debtUnderlyingBalance,
  ] = await Promise.all([
    readContract(client, {
      ...parameters,
      address: sparkLendPool,
      abi: sparkLendPoolAbi,
      functionName: "getReserveData",
      args: [collateralToken],
    }),
    readContract(client, {
      ...parameters,
      address: sparkLendPool,
      abi: sparkLendPoolAbi,
      functionName: "getReserveData",
      args: [debtToken],
    }),
    readContract(client, {
      ...parameters,
      address: sparkLendOracle,
      abi: aaveV3OracleAbi,
      functionName: "getAssetPrice",
      args: [collateralToken],
    }),
    readContract(client, {
      ...parameters,
      address: sparkLendOracle,
      abi: aaveV3OracleAbi,
      functionName: "getAssetPrice",
      args: [debtToken],
    }),
    readContract(client, {
      ...parameters,
      address: getSparkLendSpToken(collateralToken, chainId),
      abi: aaveV3ATokenAbi,
      functionName: "scaledTotalSupply",
    }),
    readContract(client, {
      ...parameters,
      address: getSparkLendVToken(collateralToken, chainId),
      abi: aaveV3VariableDebtTokenAbi,
      functionName: "scaledTotalSupply",
    }),
    readContract(client, {
      ...parameters,
      address: getSparkLendVToken(debtToken, chainId),
      abi: aaveV3VariableDebtTokenAbi,
      functionName: "scaledTotalSupply",
    }),
    readContract(client, {
      ...parameters,
      address: debtToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [getSparkLendSpToken(debtToken, chainId)],
    }),
  ]);

  return new SparkLendVenue(
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
      spTokenScaledTotalSupply: collateralSpTokenScaledTotalSupply,
      vTokenScaledTotalSupply: collateralVTokenScaledTotalSupply,
    },
    {
      price: debtPrice,
      vTokenScaledTotalSupply: debtVTokenScaledTotalSupply,
      underlyingBalance: debtUnderlyingBalance,
    },
  );
}

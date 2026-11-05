import { erc20Abi, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { createMockClient, expectReadCall, mockRead } from "@iris-credit/test/mock";
import { EMPTY_HEX, POD } from "../../../../test/fixtures/iris.js";
import {
  aaveV3ATokenAbi,
  aaveV3OracleAbi,
  aaveV3VariableDebtTokenAbi,
} from "../../../abis/aaveV3.js";
import { sparkLendPoolAbi } from "../../../abis/sparkLend.js";
import { getChainAddresses, getSparkLendSpToken, getSparkLendVToken } from "../../../addresses.js";
import { ChainId } from "../../../chain.js";
import {
  SparkLendStableBorrowingError,
  UnsupportedChainIdError,
  UnsupportedSparkLendTokenError,
} from "../../../errors.js";
import { MathLib } from "../../../math/index.js";
import { fetchSparkLendVenue } from "./fetch.js";
import { SparkLendVenue } from "./SparkLendVenue.js";

const { sparkLendPool, sparkLendOracle, tokens } = getChainAddresses(ChainId.EthMainnet);

const view = {
  id: 2n,
  data: EMPTY_HEX,
  pod: POD,
  collateral: 10n,
  debt: 4n,
  collateralIndex: MathLib.RAY,
  debtIndex: MathLib.RAY,
  lltv: 820_000_000_000_000_000n,
  lastUpdate: 1_800_000_000n,
};

const args = { collateralToken: tokens.cbBTC, debtToken: tokens.USDC } as const;

/** A reserve whose liquidity and variable-borrow fields differ, so mixed-up fields show. */
const reserve = {
  // cbBTC-shaped configuration word: ltv 81%, liquidation threshold 82%, decimals 8.
  configuration: { data: (8n << 48n) | (8_200n << 16n) | 8_100n },
  liquidityIndex: 1_100_000_000_000_000_000_000_000_000n,
  currentLiquidityRate: 30_000_000_000_000_000_000_000_000n,
  variableBorrowIndex: 1_300_000_000_000_000_000_000_000_000n,
  currentVariableBorrowRate: 70_000_000_000_000_000_000_000_000n,
  currentStableBorrowRate: 0n,
  lastUpdateTimestamp: 1_799_999_000,
  id: 10,
  aTokenAddress: zeroAddress,
  stableDebtTokenAddress: zeroAddress,
  variableDebtTokenAddress: zeroAddress,
  interestRateStrategyAddress: zeroAddress,
  accruedToTreasury: 7n,
  unbacked: 0n,
  isolationModeTotalDebt: 0n,
} as const;

const mockSparkLendClient = () => {
  const handle = createMockClient(mainnet);

  mockRead(handle, {
    address: sparkLendPool,
    abi: sparkLendPoolAbi,
    functionName: "getReserveData",
    result: reserve,
  });
  mockRead(handle, {
    address: sparkLendOracle,
    abi: aaveV3OracleAbi,
    functionName: "getAssetPrice",
    result: 200_000_000_000n,
  });
  // The token reads resolve through the pinned registry addresses, so each field carries a
  // distinct value the assertions can tell apart.
  mockRead(handle, {
    address: getSparkLendSpToken(tokens.cbBTC, ChainId.EthMainnet),
    abi: aaveV3ATokenAbi,
    functionName: "scaledTotalSupply",
    result: 5_000n,
  });
  mockRead(handle, {
    address: getSparkLendVToken(tokens.cbBTC, ChainId.EthMainnet),
    abi: aaveV3VariableDebtTokenAbi,
    functionName: "scaledTotalSupply",
    result: 5_100n,
  });
  mockRead(handle, {
    address: getSparkLendVToken(tokens.USDC, ChainId.EthMainnet),
    abi: aaveV3VariableDebtTokenAbi,
    functionName: "scaledTotalSupply",
    result: 5_200n,
  });
  mockRead(handle, {
    address: tokens.USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    result: 4_000n,
  });

  return handle;
};

describe("fetchSparkLendVenue", () => {
  test("default", async () => {
    const handle = mockSparkLendClient();
    const venue = await fetchSparkLendVenue(view, args, handle.client);

    expect(venue).toBeInstanceOf(SparkLendVenue);
    expect(venue.id).toBe(2n);
    expect(venue.pod).toBe(POD);
    expect(venue.collateral).toBe(10n);
    expect(venue.debt).toBe(4n);

    // Each reserve mirrors its `getReserveData` subset; the mock serves both tokens the same
    // reserve. The token-level data lives on the venue, not the reserves.
    const expectedReserve = {
      configuration: reserve.configuration.data,
      liquidityIndex: reserve.liquidityIndex,
      currentLiquidityRate: reserve.currentLiquidityRate,
      variableBorrowIndex: reserve.variableBorrowIndex,
      currentVariableBorrowRate: reserve.currentVariableBorrowRate,
      lastUpdateTimestamp: BigInt(reserve.lastUpdateTimestamp),
      accruedToTreasury: 7n,
    };
    expect(venue.collateralReserve).toStrictEqual(expectedReserve);
    expect(venue.debtReserve).toStrictEqual(expectedReserve);
    expect(venue.collateralData).toStrictEqual({
      price: 200_000_000_000n,
      spTokenScaledTotalSupply: 5_000n,
      vTokenScaledTotalSupply: 5_100n,
    });
    expect(venue.debtData).toStrictEqual({
      price: 200_000_000_000n,
      vTokenScaledTotalSupply: 5_200n,
      underlyingBalance: 4_000n,
    });
  });

  test("behavior: reads one SparkLend reserve per loan token", async () => {
    const handle = mockSparkLendClient();

    await fetchSparkLendVenue(view, args, handle.client);

    expect(
      expectReadCall(handle, {
        address: sparkLendPool,
        abi: sparkLendPoolAbi,
        functionName: "getReserveData",
      }).map(({ args: callArgs }) => callArgs),
    ).toStrictEqual([[tokens.cbBTC], [tokens.USDC]]);
  });

  test("behavior: reads one SparkLend oracle price per loan token", async () => {
    const handle = mockSparkLendClient();

    await fetchSparkLendVenue(view, args, handle.client);

    expect(
      expectReadCall(handle, {
        address: sparkLendOracle,
        abi: aaveV3OracleAbi,
        functionName: "getAssetPrice",
      }).map(({ args: callArgs }) => callArgs),
    ).toStrictEqual([[tokens.cbBTC], [tokens.USDC]]);
  });

  test("behavior: reads the debt liquidity off the debt reserve's spToken", async () => {
    const handle = mockSparkLendClient();

    await fetchSparkLendVenue(view, args, handle.client);

    expect(
      expectReadCall(handle, {
        address: tokens.USDC,
        abi: erc20Abi,
        functionName: "balanceOf",
      }).map(({ args: callArgs }) => callArgs),
    ).toStrictEqual([[getSparkLendSpToken(tokens.USDC, ChainId.EthMainnet)]]);
  });

  test("error: UnsupportedSparkLendTokenError on a token with no pinned reserve", async () => {
    const handle = mockSparkLendClient();

    await expect(
      fetchSparkLendVenue(view, { ...args, collateralToken: tokens.stETH }, handle.client),
    ).rejects.toBeInstanceOf(UnsupportedSparkLendTokenError);
  });

  test("error: SparkLendStableBorrowingError on a reserve with stable-rate borrowing", async () => {
    const handle = mockSparkLendClient();
    // Bit 59 of the configuration word: stable-rate borrowing enabled.
    mockRead(handle, {
      address: sparkLendPool,
      abi: sparkLendPoolAbi,
      functionName: "getReserveData",
      result: { ...reserve, configuration: { data: reserve.configuration.data | (1n << 59n) } },
    });

    await expect(fetchSparkLendVenue(view, args, handle.client)).rejects.toBeInstanceOf(
      SparkLendStableBorrowingError,
    );
  });

  test("error: UnsupportedChainIdError", async () => {
    const handle = mockSparkLendClient();

    await expect(
      fetchSparkLendVenue(view, args, handle.client, { chainId: 999 as ChainId }),
    ).rejects.toBeInstanceOf(UnsupportedChainIdError);
  });
});

import type { Address } from "viem";
import type { RpcHandler } from "@iris-credit/test/mock";

import { encodeAbiParameters, erc20Abi, keccak256, numberToHex, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { createMockClient, expectReadCall, mockRead } from "@iris-credit/test/mock";
import { POD } from "../../../test/fixtures/iris.js";
import {
  aaveV3ATokenAbi,
  aaveV3OracleAbi,
  aaveV3PoolAbi,
  aaveV3VariableDebtTokenAbi,
} from "../../abis/aaveV3.js";
import { irisAbi } from "../../abis/iris.js";
import {
  adaptiveCurveIrmAbi,
  morphoBlueAbi,
  morphoMarketParamsAbi,
} from "../../abis/morphoBlue.js";
import { venueAdapterAbi } from "../../abis/venueAdapter.js";
import { getAToken, getChainAddresses, getVToken } from "../../addresses.js";
import { ChainId } from "../../chain.js";
import { ORACLE_PRICE_SCALE } from "../../constants.js";
import { UnsupportedChainIdError, UnsupportedVenueAdapterError } from "../../errors.js";
import { AaveV3Venue } from "./aaveV3/AaveV3Venue.js";
import { fetchVenue } from "./fetch.js";
import { MorphoBlueVenue } from "./morphoBlue/MorphoBlueVenue.js";

const {
  iris,
  morphoBlue,
  morphoBlueAdapter,
  aaveV3Adapter,
  aaveV3Pool,
  aaveV3Oracle,
  adaptiveCurveIrm,
  tokens,
} = getChainAddresses(ChainId.EthMainnet);

const BLOCK_TIMESTAMP = 1_800_000_000n;

const marketParams = {
  loanToken: tokens.USDC,
  collateralToken: tokens.cbBTC,
  oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
  irm: adaptiveCurveIrm,
  lltv: 860_000_000_000_000_000n,
} as const;
const morphoData = encodeAbiParameters(morphoMarketParamsAbi, [marketParams]);

const args = {
  pod: POD,
  venueId: 1n,
  data: morphoData,
  collateralToken: tokens.cbBTC,
  debtToken: tokens.USDC,
} as const;

/** Answers `eth_getBlockByNumber`, leaving the mock's `eth_call` dispatch intact. */
const mockBlock = (handle: ReturnType<typeof createMockClient>) => {
  const base = handle.request.getMockImplementation() as RpcHandler;
  handle.request.mockImplementation(async (call) =>
    call.method === "eth_getBlockByNumber"
      ? {
          number: numberToHex(25_572_460n),
          hash: keccak256("0x01"),
          parentHash: keccak256("0x00"),
          timestamp: numberToHex(BLOCK_TIMESTAMP),
          transactions: [],
          uncles: [],
        }
      : base(call),
  );
};

/** Registers the venue adapter resolution plus the four adapter view reads. */
const mockAdapter = (
  handle: ReturnType<typeof createMockClient>,
  adapter: Address,
  { register = true }: { register?: boolean } = {},
) => {
  mockRead(handle, {
    address: iris,
    abi: irisAbi,
    functionName: "venueAdapter",
    result: adapter,
  });
  if (!register) return handle;

  mockRead(handle, {
    address: adapter,
    abi: venueAdapterAbi,
    functionName: "positionAssets",
    result: [10n, 4n],
  });
  mockRead(handle, {
    address: adapter,
    abi: venueAdapterAbi,
    functionName: "indices",
    result: [1_000_000_000_000_000_000_000_000_000n, 2_000_000_000_000_000_000_000_000_000n],
  });
  mockRead(handle, {
    address: adapter,
    abi: venueAdapterAbi,
    functionName: "lltv",
    result: 860_000_000_000_000_000n,
  });
  mockRead(handle, {
    address: adapter,
    abi: venueAdapterAbi,
    functionName: "price",
    result: ORACLE_PRICE_SCALE,
  });
  mockBlock(handle);

  return handle;
};

const mockMorphoClient = ({ irm = adaptiveCurveIrm }: { irm?: Address } = {}) => {
  const handle = createMockClient(mainnet);
  mockAdapter(handle, morphoBlueAdapter);

  const id = keccak256(encodeAbiParameters(morphoMarketParamsAbi, [{ ...marketParams, irm }]));
  mockRead(handle, {
    address: morphoBlue,
    abi: morphoBlueAbi,
    functionName: "market",
    result: [2_000n, 2_000n, 1_000n, 1_000_000n, BLOCK_TIMESTAMP, 0n],
  });
  mockRead(handle, {
    address: morphoBlue,
    abi: morphoBlueAbi,
    functionName: "position",
    result: [0n, 500_000n, 10n],
  });
  mockRead(handle, {
    address: adaptiveCurveIrm,
    abi: adaptiveCurveIrmAbi,
    functionName: "rateAtTarget",
    result: 1_268_391_679n,
  });

  return { handle, id };
};

/** A reserve whose liquidity and variable-borrow fields differ, so mixed-up fields show. */
const reserve = {
  // cbBTC-shaped configuration word: ltv 80%, liquidation threshold 83%, decimals 8.
  configuration: { data: (8n << 48n) | (8_300n << 16n) | 8_000n },
  liquidityIndex: 1_100_000_000_000_000_000_000_000_000n,
  currentLiquidityRate: 30_000_000_000_000_000_000_000_000n,
  variableBorrowIndex: 1_300_000_000_000_000_000_000_000_000n,
  currentVariableBorrowRate: 70_000_000_000_000_000_000_000_000n,
  currentStableBorrowRate: 0n,
  lastUpdateTimestamp: 1_799_999_000,
  id: 1,
  aTokenAddress: zeroAddress,
  stableDebtTokenAddress: zeroAddress,
  variableDebtTokenAddress: zeroAddress,
  interestRateStrategyAddress: zeroAddress,
  accruedToTreasury: 7n,
  unbacked: 0n,
  isolationModeTotalDebt: 0n,
} as const;

const mockAaveClient = () => {
  const handle = createMockClient(mainnet);
  mockAdapter(handle, aaveV3Adapter);
  mockRead(handle, {
    address: aaveV3Pool,
    abi: aaveV3PoolAbi,
    functionName: "getReserveData",
    result: reserve,
  });
  mockRead(handle, {
    address: aaveV3Oracle,
    abi: aaveV3OracleAbi,
    functionName: "getAssetPrice",
    result: 200_000_000_000n,
  });
  // The token reads resolve through the pinned registry addresses, so each field carries
  // a distinct value the assertions can tell apart.
  mockRead(handle, {
    address: getAToken(tokens.cbBTC, ChainId.EthMainnet),
    abi: aaveV3ATokenAbi,
    functionName: "scaledTotalSupply",
    result: 5_000n,
  });
  mockRead(handle, {
    address: getVToken(tokens.cbBTC, ChainId.EthMainnet),
    abi: aaveV3VariableDebtTokenAbi,
    functionName: "scaledTotalSupply",
    result: 5_100n,
  });
  mockRead(handle, {
    address: getAToken(tokens.USDC, ChainId.EthMainnet),
    abi: aaveV3ATokenAbi,
    functionName: "scaledTotalSupply",
    result: 6_000n,
  });
  mockRead(handle, {
    address: getVToken(tokens.USDC, ChainId.EthMainnet),
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
  mockRead(handle, {
    address: aaveV3Pool,
    abi: aaveV3PoolAbi,
    functionName: "getVirtualUnderlyingBalance",
    result: 3_000n,
  });

  return handle;
};

describe("fetchVenue", () => {
  test("default", async () => {
    const { handle } = mockMorphoClient();
    const venue = await fetchVenue(args, handle.client);

    expect(venue).toBeInstanceOf(MorphoBlueVenue);
    expect(venue.id).toBe(1n);
    expect(venue.pod).toBe(POD);
    expect(venue.data).toBe(morphoData);
    expect(venue.collateral).toBe(10n);
    expect(venue.debt).toBe(4n);
    expect(venue.lltv).toBe(860_000_000_000_000_000n);
    expect(venue.price).toBe(ORACLE_PRICE_SCALE);
  });

  test("behavior: stamps the venue's last update from the fetched block", async () => {
    const { handle } = mockMorphoClient();

    expect((await fetchVenue(args, handle.client)).lastUpdate).toBe(BLOCK_TIMESTAMP);
  });

  test("behavior: resolves the adapter from the position's venue id", async () => {
    const { handle } = mockMorphoClient();

    await fetchVenue({ ...args, venueId: 3 }, handle.client);

    expect(
      expectReadCall(handle, { address: iris, abi: irisAbi, functionName: "venueAdapter" }),
    ).toStrictEqual([{ functionName: "venueAdapter", args: [3n] }]);
  });

  test("behavior: hydrates the Morpho Blue market and the pod's position", async () => {
    const { handle } = mockMorphoClient();
    const venue = (await fetchVenue(args, handle.client)) as MorphoBlueVenue;

    expect(venue.market).toStrictEqual({
      totalSupplyAssets: 2_000n,
      totalBorrowAssets: 1_000n,
      totalBorrowShares: 1_000_000n,
      lastUpdate: BLOCK_TIMESTAMP,
    });
    expect(venue.position).toStrictEqual({ borrowShares: 500_000n, collateral: 10n });
    expect(venue.rateAtTarget).toBe(1_268_391_679n);
  });

  test("behavior: dispatches to the Aave V3 adapter", async () => {
    const handle = mockAaveClient();
    const venue = (await fetchVenue(args, handle.client)) as AaveV3Venue;

    expect(venue).toBeInstanceOf(AaveV3Venue);
    // Each reserve mirrors its `getReserveData` subset; the mock serves both tokens the
    // same reserve. The token-level data lives on the venue, not the reserves.
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
      aTokenScaledTotalSupply: 5_000n,
      vTokenScaledTotalSupply: 5_100n,
    });
    expect(venue.debtData).toStrictEqual({
      price: 200_000_000_000n,
      aTokenScaledTotalSupply: 6_000n,
      vTokenScaledTotalSupply: 5_200n,
      underlyingBalance: 4_000n,
      virtualUnderlyingBalance: 3_000n,
    });
  });

  test("behavior: reads one Aave reserve per loan token", async () => {
    const handle = mockAaveClient();

    await fetchVenue(args, handle.client);

    expect(
      expectReadCall(handle, {
        address: aaveV3Pool,
        abi: aaveV3PoolAbi,
        functionName: "getReserveData",
      }).map(({ args: callArgs }) => callArgs),
    ).toStrictEqual([[tokens.cbBTC], [tokens.USDC]]);
  });

  test("behavior: reads one Aave oracle price per loan token", async () => {
    const handle = mockAaveClient();

    await fetchVenue(args, handle.client);

    expect(
      expectReadCall(handle, {
        address: aaveV3Oracle,
        abi: aaveV3OracleAbi,
        functionName: "getAssetPrice",
      }).map(({ args: callArgs }) => callArgs),
    ).toStrictEqual([[tokens.cbBTC], [tokens.USDC]]);
  });

  test("error: UnsupportedVenueAdapterError on an unregistered venue id", async () => {
    // An unregistered venue id resolves to the zero address.
    const handle = createMockClient(mainnet);
    mockAdapter(handle, zeroAddress, { register: false });

    await expect(fetchVenue(args, handle.client)).rejects.toBeInstanceOf(
      UnsupportedVenueAdapterError,
    );
  });

  test("error: UnsupportedVenueAdapterError on an adapter with no rate model", async () => {
    // A registered adapter the SDK carries no offline model for falls through the switch.
    const handle = createMockClient(mainnet);
    mockAdapter(handle, "0x0000000000000000000000000000000000000009");

    await expect(fetchVenue(args, handle.client)).rejects.toBeInstanceOf(
      UnsupportedVenueAdapterError,
    );
  });

  test("error: UnsupportedChainIdError", async () => {
    const { handle } = mockMorphoClient();

    await expect(
      fetchVenue(args, handle.client, { chainId: 999 as ChainId }),
    ).rejects.toBeInstanceOf(UnsupportedChainIdError);
  });
});

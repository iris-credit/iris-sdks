import { encodeAbiParameters, keccak256 } from "viem";
import { getBlock, readContract } from "viem/actions";
import { describe, expect } from "vitest";
import { aaveV3PoolAbi } from "../src/abis/aaveV3.js";
import {
  adaptiveCurveIrmAbi,
  morphoBlueAbi,
  morphoIrmAbi,
  morphoMarketParamsAbi,
} from "../src/abis/morphoBlue.js";
import {
  AaveV3Venue,
  AdaptiveCurveIrmLib,
  ChainId,
  MathLib,
  MorphoBlueVenue,
  fetchVenue,
  getChainAddresses,
} from "../src/index.js";
import { test } from "./setup.js";

const { morphoBlue, morphoBlueAdapter, adaptiveCurveIrm, aaveV3Adapter, aaveV3Pool, tokens } =
  getChainAddresses(ChainId.EthMainnet);

/** The cbBTC/USDC market Iris whitelists on mainnet. */
const marketParams = {
  loanToken: tokens.USDC,
  collateralToken: tokens.cbBTC,
  oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
  irm: adaptiveCurveIrm,
  lltv: 860000000000000000n,
} as const;
const data = encodeAbiParameters(morphoMarketParamsAbi, [marketParams]);

/** `IVenueAdapter.indices`, callable directly on the adapters (plain view). */
const venueAdapterIndicesAbi = [
  {
    type: "function",
    name: "indices",
    inputs: [
      { name: "collateralToken", type: "address" },
      { name: "debtToken", type: "address" },
      { name: "data", type: "bytes" },
    ],
    outputs: [
      { name: "collateralIndex", type: "uint256" },
      { name: "debtIndex", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;

describe("venue parity (mainnet fork)", () => {
  test(
    "morpho: offline rate model matches the onchain IRM bit-for-bit",
    { timeout: 30_000 },
    async ({ client }) => {
      expect(keccak256(data)).toBe(
        "0x64d65c9a2d91c36d56fbc42d69e979335320169b3df63bf92789e2c8883fcc64",
      );

      const [market, rateAtTarget, block] = await Promise.all([
        readContract(client, {
          address: morphoBlue,
          abi: morphoBlueAbi,
          functionName: "market",
          args: [keccak256(data)],
        }),
        readContract(client, {
          address: adaptiveCurveIrm,
          abi: adaptiveCurveIrmAbi,
          functionName: "rateAtTarget",
          args: [keccak256(data)],
        }),
        getBlock(client),
      ]);
      const [
        totalSupplyAssets,
        totalSupplyShares,
        totalBorrowAssets,
        totalBorrowShares,
        lastUpdate,
        fee,
      ] = market;

      const borrowRateView = await readContract(client, {
        address: adaptiveCurveIrm,
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

      // Live view placeholders — this test exercises the accrual model only.
      const venue = new MorphoBlueVenue(
        {
          id: 0n,
          data: "0x",
          pod: "0x000000000000000000000000000000000000dEaD",
          collateral: 0n,
          debt: 0n,
          collateralIndex: MathLib.RAY,
          debtIndex: MathLib.RAY,
          lltv: 0n,
          lastUpdate: block.timestamp,
        },
        { totalSupplyAssets, totalBorrowAssets, totalBorrowShares, lastUpdate },
        { borrowShares: 0n, collateral: 0n },
        rateAtTarget,
      );

      // The Adaptive Curve mirror reproduces the onchain average borrow rate exactly.
      expect(
        AdaptiveCurveIrmLib.getBorrowRate(
          venue.utilization,
          rateAtTarget,
          block.timestamp - lastUpdate,
        ).avgBorrowRate,
      ).toBe(borrowRateView);

      // The accrued indices match the venue adapter's onchain `indices` at the same block.
      const [collateralIndex, debtIndex] = await readContract(client, {
        address: morphoBlueAdapter,
        abi: venueAdapterIndicesAbi,
        functionName: "indices",
        args: [tokens.cbBTC, tokens.USDC, data],
      });
      const accrued = venue.accrueInterest(block.timestamp);
      expect(accrued.collateralIndex).toBe(collateralIndex);
      expect(accrued.debtIndex).toBe(debtIndex);
    },
  );

  test(
    "morpho: fetchVenue hydrates the adaptive rate model",
    { timeout: 30_000 },
    async ({ client }) => {
      const venue = await fetchVenue(
        {
          // No pod holds this market on the fork: the live view reads as zeroed.
          pod: "0x000000000000000000000000000000000000dEaD",
          venueId: 1n,
          data,
          collateralToken: tokens.cbBTC,
          debtToken: tokens.USDC,
        },
        client,
      );

      expect(venue).toBeInstanceOf(MorphoBlueVenue);
      expect((venue as MorphoBlueVenue).rateAtTarget).toBeGreaterThan(0n);
    },
  );

  test(
    "aave: projected indices match the adapter's onchain indices",
    { timeout: 30_000 },
    async ({ client }) => {
      const [collateralReserve, debtReserve, block] = await Promise.all([
        readContract(client, {
          address: aaveV3Pool,
          abi: aaveV3PoolAbi,
          functionName: "getReserveData",
          args: [tokens.WETH],
        }),
        readContract(client, {
          address: aaveV3Pool,
          abi: aaveV3PoolAbi,
          functionName: "getReserveData",
          args: [tokens.USDC],
        }),
        getBlock(client),
      ]);

      // Live view placeholders — this test exercises the accrual model only.
      const venue = new AaveV3Venue(
        {
          id: 0n,
          data: "0x",
          pod: "0x000000000000000000000000000000000000dEaD",
          collateral: 0n,
          debt: 0n,
          collateralIndex: MathLib.RAY,
          debtIndex: MathLib.RAY,
          lltv: 0n,
          lastUpdate: block.timestamp,
        },
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

      const [collateralIndex, debtIndex] = await readContract(client, {
        address: aaveV3Adapter,
        abi: venueAdapterIndicesAbi,
        functionName: "indices",
        args: [tokens.WETH, tokens.USDC, "0x"],
      });
      const accrued = venue.accrueInterest(block.timestamp);
      expect(accrued.collateralIndex).toBe(collateralIndex);
      expect(accrued.debtIndex).toBe(debtIndex);
    },
  );
});

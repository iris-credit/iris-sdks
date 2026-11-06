import type { Address, Hex } from "viem";
import type { mainnet } from "viem/chains";
import type { AnvilTestClient } from "@iris-credit/test";

import { encodeAbiParameters, encodeFunctionData, erc20Abi, keccak256 } from "viem";
import { getBlock, readContract, simulateContract } from "viem/actions";
import { describe, expect } from "vitest";
import {
  aaveV3ATokenAbi,
  aaveV3OracleAbi,
  aaveV3PoolAbi,
  aaveV3VariableDebtTokenAbi,
} from "../src/abis/aaveV3.js";
import {
  adaptiveCurveIrmAbi,
  morphoBlueAbi,
  morphoIrmAbi,
  morphoMarketParamsAbi,
} from "../src/abis/morphoBlue.js";
import { sparkLendPoolAbi } from "../src/abis/sparkLend.js";
import {
  AaveV3Venue,
  AdaptiveCurveIrmLib,
  ChainId,
  MathLib,
  MorphoBlueVenue,
  ReserveConfigurationLib,
  SparkLendVenue,
  UnsupportedVenueAdapterError,
  fetchSparkLendVenue,
  fetchVenue,
  getAToken,
  getChainAddresses,
  getSparkLendSpToken,
  getSparkLendVToken,
  getVToken,
} from "../src/index.js";
import { test } from "./setup.js";

const {
  morphoBlue,
  morphoBlueAdapter,
  adaptiveCurveIrm,
  aaveV3Adapter,
  aaveV3Pool,
  aaveV3Oracle,
  sparkLendPool,
  sparkLendOracle,
  tokens,
} = getChainAddresses(ChainId.EthMainnet);

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

/** No pod holds a SparkLend position on the fork: the live view reads as zeroed. */
const sparkLendView = (lastUpdate: bigint) => ({
  id: 2n,
  data: "0x" as const,
  pod: "0x000000000000000000000000000000000000dEaD" as const,
  collateral: 0n,
  debt: 0n,
  collateralIndex: MathLib.RAY,
  debtIndex: MathLib.RAY,
  lltv: 0n,
  lastUpdate,
});

const sparkLendSupply = (asset: Address, amount: bigint, onBehalfOf: Address) =>
  encodeFunctionData({
    abi: sparkLendPoolAbi,
    functionName: "supply",
    args: [asset, amount, onBehalfOf, 0],
  });

const sparkLendBorrow = (asset: Address, amount: bigint, onBehalfOf: Address) =>
  encodeFunctionData({
    abi: sparkLendPoolAbi,
    functionName: "borrow",
    args: [asset, amount, 2n, 0, onBehalfOf],
  });

/**
 * Mines `calls` to `to` in one block at `timestamp`, in order, and returns each receipt's status.
 * Iris's adapters supply and borrow inside one transaction, so venue bounds are checked the same
 * way: every call sees the same reserve indices, and a reverted call leaves the next one the
 * state it found.
 */
const mineTogether = async (
  client: AnvilTestClient<typeof mainnet>,
  timestamp: bigint,
  to: Address,
  calls: readonly Hex[],
) => {
  await client.setAutomine(false);

  try {
    const hashes: Hex[] = [];
    // Locally signed raw transactions: the fixture's send actions and its tracing transport both
    // wait for a receipt, which never comes while automine is off. The explicit gas limit and
    // nonces skip estimation, which would run before the earlier calls land.
    const { account } = client;
    let nonce = await client.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    });
    for (const data of calls) {
      const serializedTransaction = await account.signTransaction({
        chainId: client.chain.id,
        type: "legacy",
        to,
        data,
        gas: 2_000_000n,
        gasPrice: 0n,
        nonce: nonce++,
      });

      hashes.push(
        await client.request({ method: "eth_sendRawTransaction", params: [serializedTransaction] }),
      );
    }

    await client.setNextBlockTimestamp({ timestamp });
    await client.mine({ blocks: 1 });

    return await Promise.all(
      hashes.map(async (hash) => (await client.getTransactionReceipt({ hash })).status),
    );
  } finally {
    await client.setAutomine(true);
  }
};

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
        {
          totalSupplyAssets,
          totalBorrowAssets,
          totalBorrowShares,
          lastUpdate,
          irm: marketParams.irm,
        },
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
    "aave: fetchVenue dispatches on the registered adapter",
    { timeout: 30_000 },
    async ({ client }) => {
      // Venue 0 is the Aave V3 adapter onchain; the reserves carry no market data.
      const venue = await fetchVenue(
        {
          // No pod holds a position on the fork: the live view reads as zeroed.
          pod: "0x000000000000000000000000000000000000dEaD",
          venueId: 0n,
          data: "0x",
          collateralToken: tokens.WETH,
          debtToken: tokens.USDC,
        },
        client,
      );

      expect(venue).toBeInstanceOf(AaveV3Venue);
      // The adapter reports the pair's LLTV and price, and each reserve carries the side's
      // own index — liquidity for the collateral, variable borrow for the debt.
      expect(venue.lltv).toBeGreaterThan(0n);
      expect(venue.price).toBeGreaterThan(0n);

      const aave = venue as AaveV3Venue;
      const { collateralReserve, debtReserve } = aave;
      const [collateralPool, debtPool, collateralPrice, debtPrice] = await Promise.all([
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
        readContract(client, {
          address: aaveV3Oracle,
          abi: aaveV3OracleAbi,
          functionName: "getAssetPrice",
          args: [tokens.WETH],
        }),
        readContract(client, {
          address: aaveV3Oracle,
          abi: aaveV3OracleAbi,
          functionName: "getAssetPrice",
          args: [tokens.USDC],
        }),
      ]);
      const [
        collateralScaledSupply,
        collateralScaledDebt,
        debtATokenScaledSupply,
        debtScaledDebt,
        debtHeldLiquidity,
        debtVirtualLiquidity,
      ] = await Promise.all([
        readContract(client, {
          address: collateralPool.aTokenAddress,
          abi: aaveV3ATokenAbi,
          functionName: "scaledTotalSupply",
        }),
        readContract(client, {
          address: collateralPool.variableDebtTokenAddress,
          abi: aaveV3VariableDebtTokenAbi,
          functionName: "scaledTotalSupply",
        }),
        readContract(client, {
          address: debtPool.aTokenAddress,
          abi: aaveV3ATokenAbi,
          functionName: "scaledTotalSupply",
        }),
        readContract(client, {
          address: debtPool.variableDebtTokenAddress,
          abi: aaveV3VariableDebtTokenAbi,
          functionName: "scaledTotalSupply",
        }),
        readContract(client, {
          address: tokens.USDC,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [debtPool.aTokenAddress],
        }),
        readContract(client, {
          address: aaveV3Pool,
          abi: aaveV3PoolAbi,
          functionName: "getVirtualUnderlyingBalance",
          args: [tokens.USDC],
        }),
      ]);

      expect(collateralReserve).toStrictEqual({
        configuration: collateralPool.configuration.data,
        liquidityIndex: collateralPool.liquidityIndex,
        currentLiquidityRate: collateralPool.currentLiquidityRate,
        variableBorrowIndex: collateralPool.variableBorrowIndex,
        currentVariableBorrowRate: collateralPool.currentVariableBorrowRate,
        lastUpdateTimestamp: BigInt(collateralPool.lastUpdateTimestamp),
        accruedToTreasury: collateralPool.accruedToTreasury,
      });
      expect(debtReserve).toStrictEqual({
        configuration: debtPool.configuration.data,
        liquidityIndex: debtPool.liquidityIndex,
        currentLiquidityRate: debtPool.currentLiquidityRate,
        variableBorrowIndex: debtPool.variableBorrowIndex,
        currentVariableBorrowRate: debtPool.currentVariableBorrowRate,
        lastUpdateTimestamp: BigInt(debtPool.lastUpdateTimestamp),
        accruedToTreasury: debtPool.accruedToTreasury,
      });
      expect(aave.collateralData).toStrictEqual({
        price: collateralPrice,
        aTokenScaledTotalSupply: collateralScaledSupply,
        vTokenScaledTotalSupply: collateralScaledDebt,
      });
      expect(aave.debtData).toStrictEqual({
        price: debtPrice,
        aTokenScaledTotalSupply: debtATokenScaledSupply,
        vTokenScaledTotalSupply: debtScaledDebt,
        underlyingBalance: debtHeldLiquidity,
        virtualUnderlyingBalance: debtVirtualLiquidity,
      });
      expect(ReserveConfigurationLib.getDecimals(collateralPool.configuration.data)).toBe(18n);
      expect(ReserveConfigurationLib.getDecimals(debtPool.configuration.data)).toBe(6n);
    },
  );

  test(
    "aave: pinned reserve tokens match the pool's onchain reserve tokens",
    { timeout: 30_000 },
    async ({ client }) => {
      const { DAI, USDC, USDT, WBTC, cbBTC, WETH, wstETH } = tokens;

      await Promise.all(
        [DAI, USDC, USDT, WBTC, cbBTC, WETH, wstETH].map(async (token) => {
          const reserve = await readContract(client, {
            address: aaveV3Pool,
            abi: aaveV3PoolAbi,
            functionName: "getReserveData",
            args: [token],
          });

          expect(getAToken(token, ChainId.EthMainnet)).toBe(reserve.aTokenAddress);
          expect(getVToken(token, ChainId.EthMainnet)).toBe(reserve.variableDebtTokenAddress);
        }),
      );
    },
  );

  test(
    "fetchVenue rejects a venue id with no registered adapter",
    { timeout: 30_000 },
    async ({ client }) => {
      // Only venue ids 0 through 2 are registered at the pinned block.
      await expect(
        fetchVenue(
          {
            pod: "0x000000000000000000000000000000000000dEaD",
            venueId: 3n,
            data: "0x",
            collateralToken: tokens.WETH,
            debtToken: tokens.USDC,
          },
          client,
        ),
      ).rejects.toBeInstanceOf(UnsupportedVenueAdapterError);
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

  test(
    "aave: getMaxBorrowAmount matches the onchain borrow bound",
    { timeout: 60_000 },
    async ({ client }) => {
      const collateral = MathLib.WAD; // 1 WETH into USDC debt.
      const timestamp = await client.timestamp();
      const account = client.account.address;

      const venue = await fetchVenue(
        {
          pod: "0x000000000000000000000000000000000000dEaD",
          venueId: 0n,
          data: "0x",
          collateralToken: tokens.WETH,
          debtToken: tokens.USDC,
        },
        client,
      );
      const maxBorrow = venue.getMaxBorrowAmount(collateral, { timestamp: timestamp + 2n }) ?? 0n;
      expect(maxBorrow).toBeGreaterThan(0n);

      await client.deal({ erc20: tokens.WETH, account, amount: collateral });
      await client.setNextBlockTimestamp({ timestamp: timestamp + 1n });
      await client.approve({ address: tokens.WETH, args: [aaveV3Pool, collateral] });

      // A wei past the bound fails and the bound itself fits, on the freshly supplied collateral.
      const statuses = await mineTogether(client, timestamp + 2n, aaveV3Pool, [
        encodeFunctionData({
          abi: aaveV3PoolAbi,
          functionName: "supply",
          args: [tokens.WETH, collateral, account, 0],
        }),
        encodeFunctionData({
          abi: aaveV3PoolAbi,
          functionName: "borrow",
          args: [tokens.USDC, maxBorrow + 1n, 2n, 0, account],
        }),
        encodeFunctionData({
          abi: aaveV3PoolAbi,
          functionName: "borrow",
          args: [tokens.USDC, maxBorrow, 2n, 0, account],
        }),
      ]);

      expect(statuses).toStrictEqual(["success", "reverted", "success"]);
      expect(await client.balanceOf({ erc20: tokens.USDC })).toBe(maxBorrow);
    },
  );

  test(
    "morpho: getMaxBorrowAmount matches the onchain borrow bound",
    { timeout: 60_000 },
    async ({ client }) => {
      const collateral = 5_000_000n; // 0.05 cbBTC into USDC debt.
      const timestamp = await client.timestamp();

      const venue = await fetchVenue(
        {
          pod: "0x000000000000000000000000000000000000dEaD",
          venueId: 1n,
          data,
          collateralToken: tokens.cbBTC,
          debtToken: tokens.USDC,
        },
        client,
      );

      // Anvil stamps blocks with wall-clock time — pin them so projection and chain agree.
      await client.deal({
        erc20: tokens.cbBTC,
        account: client.account.address,
        amount: collateral,
      });
      await client.setNextBlockTimestamp({ timestamp: timestamp + 1n });
      await client.approve({ address: tokens.cbBTC, args: [morphoBlue, collateral] });
      await client.setNextBlockTimestamp({ timestamp: timestamp + 2n });
      await client.writeContract({
        address: morphoBlue,
        abi: morphoBlueAbi,
        functionName: "supplyCollateral",
        args: [marketParams, collateral, client.account.address, "0x"],
      });

      const maxBorrow = venue.getMaxBorrowAmount(collateral, { timestamp: timestamp + 3n }) ?? 0n;
      expect(maxBorrow).toBeGreaterThan(0n);

      await client.setNextBlockTimestamp({ timestamp: timestamp + 3n });
      await client.writeContract({
        address: morphoBlue,
        abi: morphoBlueAbi,
        functionName: "borrow",
        args: [marketParams, maxBorrow, 0n, client.account.address, client.account.address],
      });
      expect(await client.balanceOf({ erc20: tokens.USDC })).toBe(maxBorrow);

      // One more wei on top of the maxed position does not fit.
      await expect(
        simulateContract(client, {
          address: morphoBlue,
          abi: morphoBlueAbi,
          functionName: "borrow",
          args: [marketParams, 1n, 0n, client.account.address, client.account.address],
        }),
      ).rejects.toThrow();
    },
  );

  test(
    "aave: getMaxSupplyCapacity matches the onchain supply bound",
    { timeout: 60_000 },
    async ({ client }) => {
      const timestamp = await client.timestamp();

      const venue = await fetchVenue(
        {
          pod: "0x000000000000000000000000000000000000dEaD",
          venueId: 0n,
          data: "0x",
          collateralToken: tokens.WETH,
          debtToken: tokens.USDC,
        },
        client,
      );

      const capacity = venue.getMaxSupplyCapacity(timestamp + 2n) ?? 0n;
      expect(capacity).toBeGreaterThan(0n);
      expect(capacity).toBeLessThan(MathLib.MAX_UINT_256);

      // Anvil stamps blocks with wall-clock time — pin them so projection and chain agree.
      await client.deal({
        erc20: tokens.WETH,
        account: client.account.address,
        amount: capacity + 2n,
      });
      await client.setNextBlockTimestamp({ timestamp: timestamp + 1n });
      await client.approve({ address: tokens.WETH, args: [aaveV3Pool, capacity + 2n] });
      await client.setNextBlockTimestamp({ timestamp: timestamp + 2n });
      await client.writeContract({
        address: aaveV3Pool,
        abi: aaveV3PoolAbi,
        functionName: "supply",
        args: [tokens.WETH, capacity, client.account.address, 0],
      });
      expect(await client.balanceOf({ erc20: tokens.WETH })).toBe(2n);

      // The smallest further supply the scaled floor keeps (2 wei at an index above RAY)
      // exceeds the exhausted cap.
      await expect(
        simulateContract(client, {
          address: aaveV3Pool,
          abi: aaveV3PoolAbi,
          functionName: "supply",
          args: [tokens.WETH, 2n, client.account.address, 0],
        }),
      ).rejects.toThrow();
    },
  );

  test(
    "aave: getMaxBorrowCapacity matches the onchain borrow bound",
    { timeout: 60_000 },
    async ({ client }) => {
      const timestamp = await client.timestamp();

      const venue = await fetchVenue(
        {
          pod: "0x000000000000000000000000000000000000dEaD",
          venueId: 0n,
          data: "0x",
          collateralToken: tokens.WETH,
          debtToken: tokens.USDC,
        },
        client,
      );

      const capacity = venue.getMaxBorrowCapacity(timestamp + 3n) ?? 0n;
      expect(capacity).toBeGreaterThan(0n);
      // Enough collateral that the capacity is the binding term of the borrow bound.
      const collateral = MathLib.min(
        venue.getMaxSupplyCapacity(timestamp + 2n) ?? 0n,
        200_000n * MathLib.WAD,
      );
      expect(venue.getMaxBorrowAmount(collateral, { timestamp: timestamp + 3n })).toBe(capacity);

      // Anvil stamps blocks with wall-clock time — pin them so projection and chain agree.
      await client.deal({
        erc20: tokens.WETH,
        account: client.account.address,
        amount: collateral,
      });
      await client.setNextBlockTimestamp({ timestamp: timestamp + 1n });
      await client.approve({ address: tokens.WETH, args: [aaveV3Pool, collateral] });
      await client.setNextBlockTimestamp({ timestamp: timestamp + 2n });
      await client.writeContract({
        address: aaveV3Pool,
        abi: aaveV3PoolAbi,
        functionName: "supply",
        args: [tokens.WETH, collateral, client.account.address, 0],
      });

      // The reserve lends out exactly its capacity...
      await client.setNextBlockTimestamp({ timestamp: timestamp + 3n });
      await client.writeContract({
        address: aaveV3Pool,
        abi: aaveV3PoolAbi,
        functionName: "borrow",
        args: [tokens.USDC, capacity, 2n, 0, client.account.address],
      });
      expect(await client.balanceOf({ erc20: tokens.USDC })).toBe(capacity);

      // ...and not a wei more.
      await expect(
        simulateContract(client, {
          address: aaveV3Pool,
          abi: aaveV3PoolAbi,
          functionName: "borrow",
          args: [tokens.USDC, 1n, 2n, 0, client.account.address],
        }),
      ).rejects.toThrow();
    },
  );

  test(
    "morpho: getMaxBorrowCapacity matches the onchain borrow bound",
    { timeout: 60_000 },
    async ({ client }) => {
      const timestamp = await client.timestamp();

      const venue = await fetchVenue(
        {
          pod: "0x000000000000000000000000000000000000dEaD",
          venueId: 1n,
          data,
          collateralToken: tokens.cbBTC,
          debtToken: tokens.USDC,
        },
        client,
      );

      const capacity = venue.getMaxBorrowCapacity(timestamp + 3n) ?? 0n;
      expect(capacity).toBeGreaterThan(0n);
      // Enough collateral that the capacity is the binding term of the borrow bound.
      const collateral = 10_000n * 10n ** 8n;
      expect(venue.getMaxBorrowAmount(collateral, { timestamp: timestamp + 3n })).toBe(capacity);

      // Anvil stamps blocks with wall-clock time — pin them so projection and chain agree.
      await client.deal({
        erc20: tokens.cbBTC,
        account: client.account.address,
        amount: collateral,
      });
      await client.setNextBlockTimestamp({ timestamp: timestamp + 1n });
      await client.approve({ address: tokens.cbBTC, args: [morphoBlue, collateral] });
      await client.setNextBlockTimestamp({ timestamp: timestamp + 2n });
      await client.writeContract({
        address: morphoBlue,
        abi: morphoBlueAbi,
        functionName: "supplyCollateral",
        args: [marketParams, collateral, client.account.address, "0x"],
      });

      // The market lends out exactly its idle supply...
      await client.setNextBlockTimestamp({ timestamp: timestamp + 3n });
      await client.writeContract({
        address: morphoBlue,
        abi: morphoBlueAbi,
        functionName: "borrow",
        args: [marketParams, capacity, 0n, client.account.address, client.account.address],
      });
      expect(await client.balanceOf({ erc20: tokens.USDC })).toBe(capacity);

      // ...and not a wei more.
      await expect(
        simulateContract(client, {
          address: morphoBlue,
          abi: morphoBlueAbi,
          functionName: "borrow",
          args: [marketParams, 1n, 0n, client.account.address, client.account.address],
        }),
      ).rejects.toThrow();
    },
  );

  test(
    "sparkLend: pinned reserve tokens match the pool's onchain reserve tokens",
    { timeout: 30_000 },
    async ({ client }) => {
      const { DAI, USDC, USDT, WBTC, cbBTC, WETH, wstETH } = tokens;

      await Promise.all(
        [DAI, USDC, USDT, WBTC, cbBTC, WETH, wstETH].map(async (token) => {
          const reserve = await readContract(client, {
            address: sparkLendPool,
            abi: sparkLendPoolAbi,
            functionName: "getReserveData",
            args: [token],
          });

          expect(getSparkLendSpToken(token, ChainId.EthMainnet)).toBe(reserve.aTokenAddress);
          expect(getSparkLendVToken(token, ChainId.EthMainnet)).toBe(
            reserve.variableDebtTokenAddress,
          );
        }),
      );
    },
  );

  test(
    "sparkLend: fetchSparkLendVenue hydrates the reserves the pool reports",
    { timeout: 30_000 },
    async ({ client }) => {
      const block = await getBlock(client);
      const venue = await fetchSparkLendVenue(
        sparkLendView(block.timestamp),
        { collateralToken: tokens.WETH, debtToken: tokens.USDC },
        client,
      );

      const [collateralPool, debtPool, collateralPrice, debtPrice] = await Promise.all([
        readContract(client, {
          address: sparkLendPool,
          abi: sparkLendPoolAbi,
          functionName: "getReserveData",
          args: [tokens.WETH],
        }),
        readContract(client, {
          address: sparkLendPool,
          abi: sparkLendPoolAbi,
          functionName: "getReserveData",
          args: [tokens.USDC],
        }),
        readContract(client, {
          address: sparkLendOracle,
          abi: aaveV3OracleAbi,
          functionName: "getAssetPrice",
          args: [tokens.WETH],
        }),
        readContract(client, {
          address: sparkLendOracle,
          abi: aaveV3OracleAbi,
          functionName: "getAssetPrice",
          args: [tokens.USDC],
        }),
      ]);
      const [collateralScaledSupply, collateralScaledDebt, debtScaledDebt, debtHeldLiquidity] =
        await Promise.all([
          readContract(client, {
            address: collateralPool.aTokenAddress,
            abi: aaveV3ATokenAbi,
            functionName: "scaledTotalSupply",
          }),
          readContract(client, {
            address: collateralPool.variableDebtTokenAddress,
            abi: aaveV3VariableDebtTokenAbi,
            functionName: "scaledTotalSupply",
          }),
          readContract(client, {
            address: debtPool.variableDebtTokenAddress,
            abi: aaveV3VariableDebtTokenAbi,
            functionName: "scaledTotalSupply",
          }),
          readContract(client, {
            address: tokens.USDC,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [debtPool.aTokenAddress],
          }),
        ]);

      expect(venue.collateralReserve).toStrictEqual({
        configuration: collateralPool.configuration.data,
        liquidityIndex: collateralPool.liquidityIndex,
        currentLiquidityRate: collateralPool.currentLiquidityRate,
        variableBorrowIndex: collateralPool.variableBorrowIndex,
        currentVariableBorrowRate: collateralPool.currentVariableBorrowRate,
        lastUpdateTimestamp: BigInt(collateralPool.lastUpdateTimestamp),
        accruedToTreasury: collateralPool.accruedToTreasury,
      });
      expect(venue.debtReserve).toStrictEqual({
        configuration: debtPool.configuration.data,
        liquidityIndex: debtPool.liquidityIndex,
        currentLiquidityRate: debtPool.currentLiquidityRate,
        variableBorrowIndex: debtPool.variableBorrowIndex,
        currentVariableBorrowRate: debtPool.currentVariableBorrowRate,
        lastUpdateTimestamp: BigInt(debtPool.lastUpdateTimestamp),
        accruedToTreasury: debtPool.accruedToTreasury,
      });
      expect(venue.collateralData).toStrictEqual({
        price: collateralPrice,
        spTokenScaledTotalSupply: collateralScaledSupply,
        vTokenScaledTotalSupply: collateralScaledDebt,
      });
      expect(venue.debtData).toStrictEqual({
        price: debtPrice,
        vTokenScaledTotalSupply: debtScaledDebt,
        underlyingBalance: debtHeldLiquidity,
      });
    },
  );

  test(
    "sparkLend: fetchVenue dispatches on the registered adapter",
    { timeout: 30_000 },
    async ({ client }) => {
      // Venue 2 is the SparkLend adapter; like Aave V3, its reserves carry no market data.
      const venue = await fetchVenue(
        {
          // No pod holds a position on the fork: the live view reads as zeroed.
          pod: "0x000000000000000000000000000000000000dEaD",
          venueId: 2n,
          data: "0x",
          collateralToken: tokens.WETH,
          debtToken: tokens.USDC,
        },
        client,
      );

      expect(venue).toBeInstanceOf(SparkLendVenue);
      // The adapter reads SparkLend's pool for the pair's LLTV and price.
      expect(venue.lltv).toBeGreaterThan(0n);
      expect(venue.price).toBeGreaterThan(0n);
    },
  );

  test(
    "sparkLend: projected indices match the pool's normalized indices",
    { timeout: 30_000 },
    async ({ client }) => {
      const [collateralReserve, debtReserve, block] = await Promise.all([
        readContract(client, {
          address: sparkLendPool,
          abi: sparkLendPoolAbi,
          functionName: "getReserveData",
          args: [tokens.WETH],
        }),
        readContract(client, {
          address: sparkLendPool,
          abi: sparkLendPoolAbi,
          functionName: "getReserveData",
          args: [tokens.USDC],
        }),
        getBlock(client),
      ]);

      // Live view placeholders — this test exercises the accrual model only.
      const venue = new SparkLendVenue(
        sparkLendView(block.timestamp),
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
      );

      // The pool's views are what the adapter's `indices` returns.
      const normalizedIndices = () =>
        Promise.all([
          readContract(client, {
            address: sparkLendPool,
            abi: sparkLendPoolAbi,
            functionName: "getReserveNormalizedIncome",
            args: [tokens.WETH],
          }),
          readContract(client, {
            address: sparkLendPool,
            abi: sparkLendPoolAbi,
            functionName: "getReserveNormalizedVariableDebt",
            args: [tokens.USDC],
          }),
        ]);

      const [collateralIndex, debtIndex] = await normalizedIndices();
      const accrued = venue.accrueInterest(block.timestamp);
      expect(accrued.collateralIndex).toBe(collateralIndex);
      expect(accrued.debtIndex).toBe(debtIndex);

      // Thirty days on, with nothing touching either reserve, the binomial compounding still
      // matches to the wei.
      const later = block.timestamp + 30n * 86_400n;
      await client.setNextBlockTimestamp({ timestamp: later });
      await client.mine({ blocks: 1 });

      const [laterCollateralIndex, laterDebtIndex] = await normalizedIndices();
      expect(venue.getAccrualCollateralIndex(later)).toBe(laterCollateralIndex);
      expect(venue.getAccrualDebtIndex(later)).toBe(laterDebtIndex);
    },
  );

  test(
    "sparkLend: projected pod balances match the spToken and vToken balances",
    { timeout: 60_000 },
    async ({ client }) => {
      // Odd amounts, so SparkLend's half-up scaling rounds on both legs.
      const collateral = 1_234_567_890_123_456_789n; // WETH
      const borrowed = 1_000_000_001n; // USDC
      const timestamp = await client.timestamp();
      const account = client.account.address;

      await client.deal({ erc20: tokens.WETH, account, amount: collateral });
      await client.setNextBlockTimestamp({ timestamp: timestamp + 1n });
      await client.approve({ address: tokens.WETH, args: [sparkLendPool, collateral] });
      const statuses = await mineTogether(client, timestamp + 2n, sparkLendPool, [
        sparkLendSupply(tokens.WETH, collateral, account),
        sparkLendBorrow(tokens.USDC, borrowed, account),
      ]);
      expect(statuses).toStrictEqual(["success", "success"]);

      const balances = () =>
        Promise.all([
          readContract(client, {
            address: getSparkLendSpToken(tokens.WETH, ChainId.EthMainnet),
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          }),
          readContract(client, {
            address: getSparkLendVToken(tokens.USDC, ChainId.EthMainnet),
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
          }),
        ]);
      const [[venueCollateral, venueDebt], collateralIndex, debtIndex] = await Promise.all([
        balances(),
        readContract(client, {
          address: sparkLendPool,
          abi: sparkLendPoolAbi,
          functionName: "getReserveNormalizedIncome",
          args: [tokens.WETH],
        }),
        readContract(client, {
          address: sparkLendPool,
          abi: sparkLendPoolAbi,
          functionName: "getReserveNormalizedVariableDebt",
          args: [tokens.USDC],
        }),
      ]);

      // The account stands in for a pod: Iris records its venue balances with the indices they
      // were read at.
      const venue = await fetchSparkLendVenue(
        {
          ...sparkLendView(timestamp + 2n),
          pod: account,
          collateral: venueCollateral,
          debt: venueDebt,
          collateralIndex,
          debtIndex,
        },
        { collateralToken: tokens.WETH, debtToken: tokens.USDC },
        client,
      );

      // With nothing else touching either reserve, the projections land on the tokens' own balances
      // to the wei at every step over a year. A single step can round the same way half up and
      // floored or ceiled; several make the half-up rounding show.
      for (const days of [1n, 7n, 30n, 90n, 365n]) {
        const later = timestamp + 2n + days * 86_400n;
        await client.setNextBlockTimestamp({ timestamp: later });
        await client.mine({ blocks: 1 });

        const [laterCollateral, laterDebt] = await balances();
        expect(venue.getAccrualCollateral(later)).toBe(laterCollateral);
        expect(venue.getAccrualDebt(later)).toBe(laterDebt);
      }
    },
  );

  test(
    "sparkLend: getMaxBorrowAmount matches the onchain borrow bound",
    { timeout: 60_000 },
    async ({ client }) => {
      const collateral = MathLib.WAD; // 1 WETH into USDC debt.
      const timestamp = await client.timestamp();
      const account = client.account.address;

      const venue = await fetchSparkLendVenue(
        sparkLendView(timestamp),
        { collateralToken: tokens.WETH, debtToken: tokens.USDC },
        client,
      );
      const maxBorrow = venue.getMaxBorrowAmount(collateral, { timestamp: timestamp + 2n }) ?? 0n;
      expect(maxBorrow).toBeGreaterThan(0n);

      await client.deal({ erc20: tokens.WETH, account, amount: collateral });
      await client.setNextBlockTimestamp({ timestamp: timestamp + 1n });
      await client.approve({ address: tokens.WETH, args: [sparkLendPool, collateral] });

      // A wei past the bound fails and the bound itself fits, on the freshly supplied collateral.
      const statuses = await mineTogether(client, timestamp + 2n, sparkLendPool, [
        sparkLendSupply(tokens.WETH, collateral, account),
        sparkLendBorrow(tokens.USDC, maxBorrow + 1n, account),
        sparkLendBorrow(tokens.USDC, maxBorrow, account),
      ]);

      expect(statuses).toStrictEqual(["success", "reverted", "success"]);
      expect(await client.balanceOf({ erc20: tokens.USDC })).toBe(maxBorrow);
    },
  );

  test(
    "sparkLend: getMaxBorrowCapacity matches the onchain liquidity bound",
    { timeout: 60_000 },
    async ({ client }) => {
      const timestamp = await client.timestamp();
      const account = client.account.address;

      const venue = await fetchSparkLendVenue(
        sparkLendView(timestamp),
        { collateralToken: tokens.WETH, debtToken: tokens.USDC },
        client,
      );

      // USDC carries no effective borrow cap on SparkLend: the spToken's held USDC binds.
      const capacity = venue.getMaxBorrowCapacity(timestamp + 2n) ?? 0n;
      expect(capacity).toBeGreaterThan(0n);
      expect(capacity).toBe(venue.debtData?.underlyingBalance);
      // Enough collateral that the capacity is the binding term of the borrow bound.
      const collateral = MathLib.min(
        venue.getMaxSupplyCapacity(timestamp + 2n) ?? 0n,
        3_000n * MathLib.WAD,
      );
      expect(venue.getMaxBorrowAmount(collateral, { timestamp: timestamp + 2n })).toBe(capacity);

      await client.deal({ erc20: tokens.WETH, account, amount: collateral });
      await client.setNextBlockTimestamp({ timestamp: timestamp + 1n });
      await client.approve({ address: tokens.WETH, args: [sparkLendPool, collateral] });

      // The reserve lends out exactly its liquidity, and not a wei more.
      const statuses = await mineTogether(client, timestamp + 2n, sparkLendPool, [
        sparkLendSupply(tokens.WETH, collateral, account),
        sparkLendBorrow(tokens.USDC, capacity + 1n, account),
        sparkLendBorrow(tokens.USDC, capacity, account),
      ]);

      expect(statuses).toStrictEqual(["success", "reverted", "success"]);
      expect(await client.balanceOf({ erc20: tokens.USDC })).toBe(capacity);
    },
  );

  test(
    "sparkLend: getMaxBorrowCapacity matches the onchain borrow cap",
    { timeout: 60_000 },
    async ({ client }) => {
      const timestamp = await client.timestamp();
      const account = client.account.address;

      const venue = await fetchSparkLendVenue(
        sparkLendView(timestamp),
        { collateralToken: tokens.wstETH, debtToken: tokens.WETH },
        client,
      );

      // The WETH reserve's borrow cap binds before its liquidity does.
      const capacity = venue.getMaxBorrowCapacity(timestamp + 2n) ?? 0n;
      expect(capacity).toBeGreaterThan(0n);
      expect(capacity).toBeLessThan(venue.debtData?.underlyingBalance ?? 0n);
      const collateral = MathLib.min(
        venue.getMaxSupplyCapacity(timestamp + 2n) ?? 0n,
        30_000n * MathLib.WAD,
      );
      expect(venue.getMaxBorrowAmount(collateral, { timestamp: timestamp + 2n })).toBe(capacity);

      await client.deal({ erc20: tokens.wstETH, account, amount: collateral });
      await client.setNextBlockTimestamp({ timestamp: timestamp + 1n });
      await client.approve({ address: tokens.wstETH, args: [sparkLendPool, collateral] });

      const statuses = await mineTogether(client, timestamp + 2n, sparkLendPool, [
        sparkLendSupply(tokens.wstETH, collateral, account),
        sparkLendBorrow(tokens.WETH, capacity + 1n, account),
        sparkLendBorrow(tokens.WETH, capacity, account),
      ]);

      expect(statuses).toStrictEqual(["success", "reverted", "success"]);
      expect(await client.balanceOf({ erc20: tokens.WETH })).toBe(capacity);
    },
  );

  test(
    "sparkLend: getMaxSupplyCapacity matches the onchain supply cap",
    { timeout: 60_000 },
    async ({ client }) => {
      const timestamp = await client.timestamp();
      const account = client.account.address;

      const venue = await fetchSparkLendVenue(
        sparkLendView(timestamp),
        { collateralToken: tokens.WETH, debtToken: tokens.USDC },
        client,
      );

      const capacity = venue.getMaxSupplyCapacity(timestamp + 2n) ?? 0n;
      expect(capacity).toBeGreaterThan(0n);
      expect(capacity).toBeLessThan(MathLib.MAX_UINT_256);

      await client.deal({ erc20: tokens.WETH, account, amount: capacity + 1n });
      await client.setNextBlockTimestamp({ timestamp: timestamp + 1n });
      await client.approve({ address: tokens.WETH, args: [sparkLendPool, capacity + 1n] });

      // The cap admits exactly the capacity, and not a wei more.
      const statuses = await mineTogether(client, timestamp + 2n, sparkLendPool, [
        sparkLendSupply(tokens.WETH, capacity + 1n, account),
        sparkLendSupply(tokens.WETH, capacity, account),
      ]);

      expect(statuses).toStrictEqual(["reverted", "success"]);
      expect(await client.balanceOf({ erc20: tokens.WETH })).toBe(1n);
    },
  );
});

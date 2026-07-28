import type { RpcHandler } from "@iris-credit/test/mock";

import { encodeAbiParameters, keccak256, numberToHex } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { createMockClient, expectReadCall, mockRead } from "@iris-credit/test/mock";
import { POD, SOLVER, USER } from "../../__test__/fixtures.js";
import { irisAbi } from "../../abis/iris.js";
import {
  adaptiveCurveIrmAbi,
  morphoBlueAbi,
  morphoMarketParamsAbi,
} from "../../abis/morphoBlue.js";
import { venueAdapterAbi } from "../../abis/venueAdapter.js";
import { getChainAddresses } from "../../addresses.js";
import { ChainId } from "../../chain.js";
import { ORACLE_PRICE_SCALE } from "../../constants.js";
import { UnsupportedChainIdError } from "../../errors.js";
import { MathLib } from "../../math/index.js";
import { MorphoBlueMath } from "../venue/morphoBlue/MorphoBlueMath.js";
import { MorphoBlueVenue } from "../venue/morphoBlue/MorphoBlueVenue.js";
import { fetchAccrualPosition, fetchPosition } from "./fetch.js";
import { AccrualPosition, Position } from "./Position.js";

const { iris, morphoBlue, morphoBlueAdapter, adaptiveCurveIrm, tokens } = getChainAddresses(
  ChainId.EthMainnet,
);

const BLOCK_TIMESTAMP = 1_800_000_000n;

const marketParams = {
  loanToken: tokens.USDC,
  collateralToken: tokens.cbBTC,
  oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
  irm: adaptiveCurveIrm,
  lltv: 860_000_000_000_000_000n,
} as const;
const morphoData = encodeAbiParameters(morphoMarketParamsAbi, [marketParams]);

const COLLATERAL = 2n * MathLib.WAD;
const DEBT = MathLib.WAD;
const TOTAL_BORROW_SHARES = 1_000_000n * MathLib.WAD;

/** The venue adapter's indices for the mocked market, as `MorphoBlueVenue` derives them. */
const DEBT_INDEX = MathLib.mulDivDown(
  DEBT + MorphoBlueMath.VIRTUAL_ASSETS,
  MorphoBlueMath.INDEX_SCALE,
  TOTAL_BORROW_SHARES + MorphoBlueMath.VIRTUAL_SHARES,
);

/** The `getPosition` tuple as the contract returns it: `lastUpdate` and `venueId` packed. */
const storedPosition = {
  collateral: COLLATERAL,
  debt: DEBT,
  bond: MathLib.WAD / 10n,
  bondRequirement: MathLib.WAD / 100n,
  collateralIndex: MorphoBlueMath.COLLATERAL_INDEX,
  debtIndex: DEBT_INDEX,
  fixedLeg: 0n,
  floatingLeg: 0n,
  surplus: 0n,
  lastUpdate: 1_799_999_000,
  venueId: 1,
  data: morphoData,
} as const;

const storedLoan = {
  borrower: USER,
  solver: SOLVER,
  collateralToken: tokens.cbBTC,
  debtToken: tokens.USDC,
  venueBitmap: 0b111n,
  maturity: 1_900_000_000,
  overduePeriod: 3_600,
  fixedRate: 500,
  overdueRate: 1_000,
  bondLltv: 9_500,
  fee: 2_000,
} as const;

const mockPositionClient = (position: unknown = storedPosition) => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: iris,
    abi: irisAbi,
    functionName: "getPosition",
    result: position,
  });

  return handle;
};

/** Extends a position client with everything `fetchAccrualPosition` fans out to. */
const mockAccrualClient = () => {
  const handle = mockPositionClient();

  mockRead(handle, { address: iris, abi: irisAbi, functionName: "getLoan", result: storedLoan });
  mockRead(handle, {
    address: iris,
    abi: irisAbi,
    functionName: "venueAdapter",
    result: morphoBlueAdapter,
  });
  mockRead(handle, {
    address: morphoBlueAdapter,
    abi: venueAdapterAbi,
    functionName: "positionAssets",
    result: [COLLATERAL, DEBT],
  });
  mockRead(handle, {
    address: morphoBlueAdapter,
    abi: venueAdapterAbi,
    functionName: "indices",
    result: [MorphoBlueMath.COLLATERAL_INDEX, DEBT_INDEX],
  });
  mockRead(handle, {
    address: morphoBlueAdapter,
    abi: venueAdapterAbi,
    functionName: "lltv",
    result: 860_000_000_000_000_000n,
  });
  mockRead(handle, {
    address: morphoBlueAdapter,
    abi: venueAdapterAbi,
    functionName: "price",
    result: ORACLE_PRICE_SCALE,
  });
  mockRead(handle, {
    address: morphoBlue,
    abi: morphoBlueAbi,
    functionName: "market",
    result: [2n * MathLib.WAD, 2n * MathLib.WAD, DEBT, TOTAL_BORROW_SHARES, BLOCK_TIMESTAMP, 0n],
  });
  mockRead(handle, {
    address: morphoBlue,
    abi: morphoBlueAbi,
    functionName: "position",
    result: [0n, TOTAL_BORROW_SHARES, COLLATERAL],
  });
  mockRead(handle, {
    address: adaptiveCurveIrm,
    abi: adaptiveCurveIrmAbi,
    functionName: "rateAtTarget",
    result: 1_268_391_679n,
  });

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

  return handle;
};

describe("fetchPosition", () => {
  test("default", async () => {
    const { client } = mockPositionClient();

    expect(await fetchPosition(POD, client)).toStrictEqual(
      new Position({
        pod: POD,
        collateral: COLLATERAL,
        debt: DEBT,
        bond: MathLib.WAD / 10n,
        bondRequirement: MathLib.WAD / 100n,
        collateralIndex: MorphoBlueMath.COLLATERAL_INDEX,
        debtIndex: DEBT_INDEX,
        fixedLeg: 0n,
        floatingLeg: 0n,
        surplus: 0n,
        lastUpdate: 1_799_999_000n,
        venueId: 1n,
        data: morphoData,
      }),
    );
  });

  test("behavior: widens the packed lastUpdate and venueId to bigint", async () => {
    const { client } = mockPositionClient();
    const position = await fetchPosition(POD, client);

    expect(position.lastUpdate).toBe(1_799_999_000n);
    expect(position.venueId).toBe(1n);
  });

  test("behavior: keys the position by the requested pod", async () => {
    // The contract's `Position` struct carries no pod — the fetcher stamps it.
    const handle = mockPositionClient();

    expect((await fetchPosition(POD, handle.client)).pod).toBe(POD);
    expect(
      expectReadCall(handle, { address: iris, abi: irisAbi, functionName: "getPosition" }),
    ).toStrictEqual([{ functionName: "getPosition", args: [POD] }]);
  });

  test("behavior: hydrates a pod with no loan as a zeroed position", async () => {
    const { client } = mockPositionClient({
      collateral: 0n,
      debt: 0n,
      bond: 0n,
      bondRequirement: 0n,
      collateralIndex: 0n,
      debtIndex: 0n,
      fixedLeg: 0n,
      floatingLeg: 0n,
      surplus: 0n,
      lastUpdate: 0,
      venueId: 0,
      data: "0x",
    });
    const position = await fetchPosition(POD, client);

    expect(position.lastUpdate).toBe(0n);
    expect(position.bondRequirement).toBe(0n);
  });

  test("error: UnsupportedChainIdError", async () => {
    const { client } = mockPositionClient();

    await expect(fetchPosition(POD, client, { chainId: 999 as ChainId })).rejects.toBeInstanceOf(
      UnsupportedChainIdError,
    );
  });
});

describe("fetchAccrualPosition", () => {
  test("default", async () => {
    const handle = mockAccrualClient();
    const position = await fetchAccrualPosition(POD, handle.client);

    expect(position).toBeInstanceOf(AccrualPosition);
    expect(position.pod).toBe(POD);
    expect(position.collateral).toBe(COLLATERAL);
    expect(position.venueId).toBe(1n);
  });

  test("behavior: pairs the position with its loan and its venue", async () => {
    const handle = mockAccrualClient();
    const position = await fetchAccrualPosition(POD, handle.client);

    expect(position.loan.pod).toBe(POD);
    expect(position.loan.solver).toBe(SOLVER);
    // BP-compressed onchain, WAD on the entity.
    expect(position.loan.fixedRate).toBe(50_000_000_000_000_000n);
    expect(position.venue).toBeInstanceOf(MorphoBlueVenue);
    expect(position.venue.id).toBe(position.venueId);
    expect(position.venue.data).toBe(position.data);
  });

  test("behavior: identifies the venue from the position, not from the caller", async () => {
    const handle = mockAccrualClient();

    await fetchAccrualPosition(POD, handle.client);

    expect(
      expectReadCall(handle, { address: iris, abi: irisAbi, functionName: "venueAdapter" }),
    ).toStrictEqual([{ functionName: "venueAdapter", args: [1n] }]);
  });

  test("behavior: resolves the chain id once and threads it to every inner fetch", async () => {
    const handle = mockAccrualClient();

    await fetchAccrualPosition(POD, handle.client);

    expect(
      handle.request.mock.calls.filter(([call]) => call.method === "eth_chainId"),
    ).toHaveLength(1);
  });

  test("behavior: yields a position ready to accrue offline", async () => {
    const handle = mockAccrualClient();
    const position = await fetchAccrualPosition(POD, handle.client);
    const accrued = position.accrueLegs(BLOCK_TIMESTAMP + 86_400n);

    expect(accrued.lastUpdate).toBe(BLOCK_TIMESTAMP + 86_400n);
    expect(accrued.fixedLeg).toBeGreaterThan(position.fixedLeg);
  });

  test("error: UnsupportedChainIdError", async () => {
    const handle = mockAccrualClient();

    await expect(
      fetchAccrualPosition(POD, handle.client, { chainId: 999 as ChainId }),
    ).rejects.toBeInstanceOf(UnsupportedChainIdError);
  });
});

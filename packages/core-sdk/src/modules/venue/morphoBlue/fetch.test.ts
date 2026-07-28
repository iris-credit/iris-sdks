import type { Address } from "viem";

import { encodeAbiParameters, keccak256 } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { createMockClient, expectReadCall, mockRead } from "@iris-credit/test/mock";
import { EMPTY_HEX, POD } from "../../../__test__/fixtures.js";
import {
  adaptiveCurveIrmAbi,
  morphoBlueAbi,
  morphoMarketParamsAbi,
} from "../../../abis/morphoBlue.js";
import { getChainAddresses } from "../../../addresses.js";
import { ChainId } from "../../../chain.js";
import { UnsupportedChainIdError } from "../../../errors.js";
import { MathLib } from "../../../math/index.js";
import { fetchMorphoBlueVenue } from "./fetch.js";

const { morphoBlue, adaptiveCurveIrm, tokens } = getChainAddresses(ChainId.EthMainnet);

/** An IRM other than the canonical Adaptive Curve deployment. */
const OTHER_IRM: Address = "0x0000000000000000000000000000000000000009";

const marketParams = (irm: Address) =>
  ({
    loanToken: tokens.USDC,
    collateralToken: tokens.cbBTC,
    oracle: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
    irm,
    lltv: 860_000_000_000_000_000n,
  }) as const;

const encodeData = (irm: Address) =>
  encodeAbiParameters(morphoMarketParamsAbi, [marketParams(irm)]);

const view = {
  id: 1n,
  data: EMPTY_HEX,
  pod: POD,
  collateral: 10n,
  debt: 4n,
  collateralIndex: MathLib.RAY,
  debtIndex: MathLib.RAY,
  lltv: 860_000_000_000_000_000n,
  lastUpdate: 1_800_000_000n,
};

const mockMorphoBlueClient = () => {
  const handle = createMockClient(mainnet);

  mockRead(handle, {
    address: morphoBlue,
    abi: morphoBlueAbi,
    functionName: "market",
    result: [2_000n, 2_000n, 1_000n, 1_000_000n, 1_799_999_000n, 0n],
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

  return handle;
};

describe("fetchMorphoBlueVenue", () => {
  test("default", async () => {
    const handle = mockMorphoBlueClient();
    const data = encodeData(adaptiveCurveIrm);
    const venue = await fetchMorphoBlueVenue(view, { pod: POD, data }, handle.client);

    expect(venue.market).toStrictEqual({
      totalSupplyAssets: 2_000n,
      totalBorrowAssets: 1_000n,
      totalBorrowShares: 1_000_000n,
      lastUpdate: 1_799_999_000n,
    });
    expect(venue.position).toStrictEqual({ borrowShares: 500_000n, collateral: 10n });
    expect(venue.rateAtTarget).toBe(1_268_391_679n);
  });

  test("behavior: derives the market id from the encoded market params", async () => {
    const handle = mockMorphoBlueClient();
    const data = encodeData(adaptiveCurveIrm);

    await fetchMorphoBlueVenue(view, { pod: POD, data }, handle.client);

    const id = keccak256(data);
    expect(
      expectReadCall(handle, {
        address: morphoBlue,
        abi: morphoBlueAbi,
        functionName: "market",
      }),
    ).toStrictEqual([{ functionName: "market", args: [id] }]);
    expect(
      expectReadCall(handle, {
        address: morphoBlue,
        abi: morphoBlueAbi,
        functionName: "position",
      }),
    ).toStrictEqual([{ functionName: "position", args: [id, POD] }]);
  });

  test("behavior: leaves rateAtTarget undefined on a non-canonical IRM", async () => {
    const handle = mockMorphoBlueClient();
    const data = encodeData(OTHER_IRM);
    const venue = await fetchMorphoBlueVenue(view, { pod: POD, data }, handle.client);

    expect(venue.rateAtTarget).toBeUndefined();
    // Without a rate model the venue holds its indices flat instead of guessing one.
    expect(venue.accrueInterest(view.lastUpdate + 86_400n).debtIndex).toBe(
      venue.accrueInterest(view.lastUpdate).debtIndex,
    );
  });

  test("behavior: skips the IRM read entirely on a non-canonical IRM", async () => {
    const handle = mockMorphoBlueClient();
    const data = encodeData(OTHER_IRM);

    await fetchMorphoBlueVenue(view, { pod: POD, data }, handle.client);

    expect(
      expectReadCall(handle, {
        address: adaptiveCurveIrm,
        abi: adaptiveCurveIrmAbi,
        functionName: "rateAtTarget",
      }),
    ).toStrictEqual([]);
  });

  test("error: UnsupportedChainIdError", async () => {
    const handle = mockMorphoBlueClient();
    const data = encodeData(adaptiveCurveIrm);

    await expect(
      fetchMorphoBlueVenue(view, { pod: POD, data }, handle.client, {
        chainId: 999 as ChainId,
      }),
    ).rejects.toBeInstanceOf(UnsupportedChainIdError);
  });
});

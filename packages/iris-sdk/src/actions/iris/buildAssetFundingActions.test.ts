import { describe, expect, test } from "vitest";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { CHAIN_ID, COLLATERAL_TOKEN } from "../../../test/fixtures/iris.js";
import { permit2Signature } from "../../../test/helpers/permit.js";
import { buildAssetFundingActions } from "./buildAssetFundingActions.js";

describe("buildAssetFundingActions", () => {
  const {
    wNative,
    bundler3: { bundler3, generalAdapter1 },
  } = getChainAddresses(CHAIN_ID);

  test("default: pulls the ERC-20 amount and emits no native actions", () => {
    expect(
      buildAssetFundingActions({
        chainId: CHAIN_ID,
        asset: COLLATERAL_TOKEN,
        erc20Amount: 1_000n,
        nativeAmount: 0n,
      }),
    ).toEqual([
      {
        type: "erc20TransferFrom",
        args: [COLLATERAL_TOKEN, 1_000n, generalAdapter1, false],
      },
    ]);
  });

  test("behavior: a fully native funding wraps and emits no ERC-20 pull", () => {
    expect(
      buildAssetFundingActions({
        chainId: CHAIN_ID,
        asset: wNative,
        erc20Amount: 0n,
        nativeAmount: 1_000n,
      }),
    ).toEqual([
      {
        type: "nativeTransfer",
        args: [bundler3, generalAdapter1, 1_000n, false],
      },
      {
        type: "wrapNative",
        args: [1_000n, generalAdapter1, false],
      },
    ]);
  });

  test("behavior: a mixed funding wraps before pulling the ERC-20 remainder", () => {
    expect(
      buildAssetFundingActions({
        chainId: CHAIN_ID,
        asset: wNative,
        erc20Amount: 400n,
        nativeAmount: 600n,
      }).map((action) => action.type),
    ).toEqual(["nativeTransfer", "wrapNative", "erc20TransferFrom"]);
  });

  test("behavior: funding nothing returns no actions", () => {
    expect(
      buildAssetFundingActions({
        chainId: CHAIN_ID,
        asset: COLLATERAL_TOKEN,
        erc20Amount: 0n,
        nativeAmount: 0n,
      }),
    ).toEqual([]);
  });

  test("behavior: forwards the requirement signature on the ERC-20 remainder only", () => {
    const requirementSignature = permit2Signature({ amount: 400n, asset: wNative });

    const actions = buildAssetFundingActions({
      chainId: CHAIN_ID,
      asset: wNative,
      erc20Amount: 400n,
      nativeAmount: 600n,
      requirementSignature,
    });

    expect(actions.map((action) => action.type)).toEqual([
      "nativeTransfer",
      "wrapNative",
      "approve2",
      "transferFrom2",
    ]);
  });
});

import type { Permit2Args } from "../../types/index.js";

import { describe, expect, test } from "vitest";
import { getChainAddresses } from "@iris-credit/core-sdk";
import {
  CHAIN_ID,
  COLLATERAL_TOKEN,
  DEBT_TOKEN,
  SIGNATURE,
  USER_A,
} from "../../../test/fixtures/iris.js";
import { permit2Signature, permitSignature } from "../../../test/helpers/permit.js";
import {
  DepositAmountMismatchError,
  DepositAssetMismatchError,
  Permit2ExpirationMissingError,
} from "../../types/index.js";
import { getTokenRequirementActions } from "./getTokenRequirementActions.js";

const {
  bundler3: { generalAdapter1 },
} = getChainAddresses(CHAIN_ID);

describe("getTokenRequirementActions", () => {
  test("default: emits a plain erc20TransferFrom without a signature", () => {
    expect(
      getTokenRequirementActions({
        asset: COLLATERAL_TOKEN,
        amount: 1_000n,
        recipient: generalAdapter1,
      }),
    ).toEqual([
      {
        type: "erc20TransferFrom",
        args: [COLLATERAL_TOKEN, 1_000n, generalAdapter1, false],
      },
    ]);
  });

  test("behavior: a permit2 signature emits approve2 then transferFrom2", () => {
    const requirementSignature = permit2Signature({ amount: 1_000n, nonce: 3n, expiration: 42n });

    expect(
      getTokenRequirementActions({
        asset: COLLATERAL_TOKEN,
        amount: 1_000n,
        recipient: generalAdapter1,
        requirementSignature,
      }),
    ).toEqual([
      {
        type: "approve2",
        args: [
          USER_A,
          {
            details: {
              token: COLLATERAL_TOKEN,
              amount: 1_000n,
              nonce: 3,
              expiration: 42,
            },
            sigDeadline: requirementSignature.args.deadline,
          },
          SIGNATURE,
          false,
        ],
      },
      {
        type: "transferFrom2",
        args: [COLLATERAL_TOKEN, 1_000n, generalAdapter1, false],
      },
    ]);
  });

  test("behavior: a classic permit signature emits permit then erc20TransferFrom", () => {
    const requirementSignature = permitSignature({ amount: 1_000n });

    expect(
      getTokenRequirementActions({
        asset: COLLATERAL_TOKEN,
        amount: 1_000n,
        recipient: generalAdapter1,
        requirementSignature,
      }),
    ).toEqual([
      {
        type: "permit",
        args: [
          USER_A,
          COLLATERAL_TOKEN,
          1_000n,
          requirementSignature.args.deadline,
          SIGNATURE,
          false,
        ],
      },
      {
        type: "erc20TransferFrom",
        args: [COLLATERAL_TOKEN, 1_000n, generalAdapter1, false],
      },
    ]);
  });

  // USDC rather than a sentinel: its checksum carries mixed-case letters, so lowercasing it
  // actually differs from the checksummed form the caller passes.
  test("behavior: the signed asset matches case-insensitively", () => {
    const { USDC } = getChainAddresses(CHAIN_ID).tokens;
    const requirementSignature = permitSignature({
      amount: 1_000n,
      asset: USDC.toLowerCase() as typeof USDC,
    });

    expect(USDC.toLowerCase()).not.toBe(USDC);
    expect(() =>
      getTokenRequirementActions({
        asset: USDC,
        amount: 1_000n,
        recipient: generalAdapter1,
        requirementSignature,
      }),
    ).not.toThrow();
  });

  test("error: DepositAssetMismatchError", () => {
    expect(() =>
      getTokenRequirementActions({
        asset: COLLATERAL_TOKEN,
        amount: 1_000n,
        recipient: generalAdapter1,
        requirementSignature: permitSignature({ amount: 1_000n, asset: DEBT_TOKEN }),
      }),
    ).toThrow(DepositAssetMismatchError);
  });

  test("error: DepositAmountMismatchError when the signed amount is larger", () => {
    expect(() =>
      getTokenRequirementActions({
        asset: COLLATERAL_TOKEN,
        amount: 1_000n,
        recipient: generalAdapter1,
        requirementSignature: permitSignature({ amount: 1_001n }),
      }),
    ).toThrow(DepositAmountMismatchError);
  });

  test("error: DepositAmountMismatchError when the signed amount is smaller", () => {
    expect(() =>
      getTokenRequirementActions({
        asset: COLLATERAL_TOKEN,
        amount: 1_000n,
        recipient: generalAdapter1,
        requirementSignature: permitSignature({ amount: 999n }),
      }),
    ).toThrow(DepositAmountMismatchError);
  });

  test("error: Permit2ExpirationMissingError", () => {
    const { action, args } = permit2Signature({ amount: 1_000n });
    const { expiration: _expiration, ...argsWithoutExpiration } = args as Permit2Args;

    expect(() =>
      getTokenRequirementActions({
        asset: COLLATERAL_TOKEN,
        amount: 1_000n,
        recipient: generalAdapter1,
        requirementSignature: { action, args: argsWithoutExpiration },
      }),
    ).toThrow(Permit2ExpirationMissingError);
  });
});

import type { Address } from "viem";

import { describe, expect, test } from "vitest";
import { getChainAddresses } from "@iris-credit/core-sdk";
import { CHAIN_ID, ROGUE } from "../../../test/fixtures/iris.js";
import {
  ApprovalAmountLessThanSpendAmountError,
  UnsupportedErc20ApprovalSpenderError,
} from "../../types/index.js";
import { getRequirementsApproval } from "./getRequirementsApproval.js";

const {
  tokens: { USDC, USDT },
  bundler3: { generalAdapter1 },
} = getChainAddresses(CHAIN_ID);

describe("getRequirementsApproval", () => {
  test("default", () => {
    const requirements = getRequirementsApproval({
      address: USDC,
      chainId: CHAIN_ID,
      args: {
        spendAmount: 1_000n,
        approvalAmount: 1_000n,
        spender: generalAdapter1,
      },
      allowances: 0n,
    });

    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.action.args.amount).toBe(1_000n);
    expect(requirements[0]?.to).toBe(USDC);
  });

  test("behavior: returns no approval when allowance already covers spend", () => {
    expect(
      getRequirementsApproval({
        address: USDC,
        chainId: CHAIN_ID,
        args: {
          spendAmount: 1_000n,
          approvalAmount: 1_000n,
          spender: generalAdapter1,
        },
        allowances: 1_000n,
      }),
    ).toEqual([]);
  });

  test("behavior: resets approve-only-once token before approving", () => {
    const requirements = getRequirementsApproval({
      address: USDT,
      chainId: CHAIN_ID,
      args: {
        spendAmount: 1_000n,
        approvalAmount: 2_000n,
        spender: generalAdapter1,
      },
      allowances: 1n,
    });

    expect(requirements.map((requirement) => requirement.action.args.amount)).toEqual([0n, 2_000n]);
  });

  test("behavior: matches the approve-only-once token case-insensitively", () => {
    const requirements = getRequirementsApproval({
      address: USDT.toLowerCase() as Address,
      chainId: CHAIN_ID,
      args: {
        spendAmount: 1_000n,
        approvalAmount: 2_000n,
        spender: generalAdapter1,
      },
      allowances: 1n,
    });

    expect(requirements.map((requirement) => requirement.action.args.amount)).toEqual([0n, 2_000n]);
  });

  test("error: ApprovalAmountLessThanSpendAmountError", () => {
    expect(() =>
      getRequirementsApproval({
        address: USDC,
        chainId: CHAIN_ID,
        args: {
          spendAmount: 1_000n,
          approvalAmount: 999n,
          spender: generalAdapter1,
        },
        allowances: 0n,
      }),
    ).toThrow(ApprovalAmountLessThanSpendAmountError);
  });

  test("error: UnsupportedErc20ApprovalSpenderError", () => {
    expect(() =>
      getRequirementsApproval({
        address: USDC,
        chainId: CHAIN_ID,
        args: {
          spendAmount: 1_000n,
          approvalAmount: 1_000n,
          spender: ROGUE,
        },
        allowances: 0n,
      }),
    ).toThrow(UnsupportedErc20ApprovalSpenderError);
  });
});

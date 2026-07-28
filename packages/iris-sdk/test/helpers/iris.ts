import type { Address, Hex } from "viem";
import type { Quote } from "@iris-credit/core-sdk";
import type { AuthorizationRequirementSignature } from "../../src/types/index.js";

import { decodeFunctionData, isAddressEqual } from "viem";
import { expect } from "vitest";
import { erc2612Abi, getChainAddresses, irisAbi, permit2Abi } from "@iris-credit/core-sdk";
import { bundler3Abi, generalAdapter1 as generalAdapter1Abi } from "../../src/abis/index.js";
import {
  BLM,
  BORROWER,
  CHAIN_ID,
  COLLATERAL_TOKEN,
  DEBT_TOKEN,
  RECEIVER,
  SIGNATURE,
  SOLVER,
  USER_A,
} from "../fixtures/iris.js";

/**
 * Builds a `Quote` whose amounts and bounds pass every `irisTake` guard, so a test only
 * overrides the field it is exercising.
 *
 * @internal
 */
export const quote = (overrides: Partial<Quote> = {}): Quote => ({
  borrower: BORROWER,
  solver: SOLVER,
  receiver: RECEIVER,
  blm: BLM,
  collateralToken: COLLATERAL_TOKEN,
  debtToken: DEBT_TOKEN,
  collateral: 1_000_000_000_000_000_000n,
  debt: 1_000_000n,
  fixedRate: 50_000_000_000_000_000n,
  duration: 2_592_000n,
  overdueRate: 100_000_000_000_000_000n,
  overduePeriod: 86_400n,
  bond: 10_000n,
  bondLltv: 900_000_000_000_000_000n,
  venueBitmap: 1n,
  venueId: 0n,
  deadline: 1_900_000_000n,
  nonce: 1n,
  data: "0x",
  ...overrides,
});

/**
 * Builds a signed Iris authorization requirement signature, authorizing the chain's
 * `GeneralAdapter1` by default — the only operator a bundled path may grant rights to.
 *
 * @internal
 */
export const authorizationSignature = (
  overrides: Partial<AuthorizationRequirementSignature["args"]> = {},
): AuthorizationRequirementSignature => {
  const args: AuthorizationRequirementSignature["args"] = {
    owner: USER_A,
    authorized: getChainAddresses(CHAIN_ID).bundler3.generalAdapter1,
    isAuthorized: true,
    nonce: 7n,
    deadline: 1_900_000_000n,
    signature: SIGNATURE,
    ...overrides,
  };

  return {
    action: {
      type: "authorization",
      args: {
        authorized: args.authorized,
        isAuthorized: args.isAuthorized,
        deadline: args.deadline,
      },
    },
    args,
  };
};

/** Decodes the bundler3 `multicall` calldata into its ordered inner calls. @internal */
export const decodeBundle = (data: Hex) => {
  const decoded = decodeFunctionData({ abi: bundler3Abi, data });
  expect(decoded.functionName).toBe("multicall");

  return decoded.args[0] ?? [];
};

/**
 * Names each inner call by the function it invokes on its target, preserving bundle order.
 *
 * @internal
 */
export const callNames = (calls: readonly { to: Address; data: Hex }[]) => {
  const {
    iris,
    permit2,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(CHAIN_ID);

  return calls.map((call) => {
    if (call.data === "0x") return "nativeTransfer";
    if (isAddressEqual(call.to, iris)) {
      return decodeFunctionData({ abi: irisAbi, data: call.data }).functionName;
    }
    if (isAddressEqual(call.to, permit2)) {
      return `permit2.${decodeFunctionData({ abi: permit2Abi, data: call.data }).functionName}`;
    }
    if (isAddressEqual(call.to, generalAdapter1)) {
      return decodeFunctionData({ abi: generalAdapter1Abi, data: call.data }).functionName;
    }

    return `token.${decodeFunctionData({ abi: erc2612Abi, data: call.data }).functionName}`;
  });
};

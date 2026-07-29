import type { PermitRequirementSignature, Permit2Args, PermitArgs } from "../../src/types/index.js";

import { getChainAddresses } from "@iris-credit/core-sdk";
import { CHAIN_ID, COLLATERAL_TOKEN, SIGNATURE, USER_A } from "../fixtures/iris.js";

/** Builds a signed ERC-2612 permit requirement signature. @internal */
export const permitSignature = (
  overrides: Partial<PermitArgs> = {},
): PermitRequirementSignature => {
  const args: PermitArgs = {
    owner: USER_A,
    asset: COLLATERAL_TOKEN,
    amount: 1n,
    nonce: 0n,
    deadline: 1_900_000_000n,
    signature: SIGNATURE,
    ...overrides,
  };

  return {
    action: {
      type: "permit",
      args: {
        spender: getChainAddresses(CHAIN_ID).bundler3.generalAdapter1,
        amount: args.amount,
        deadline: args.deadline,
      },
    },
    args,
  };
};

/** Builds a signed Permit2 requirement signature. @internal */
export const permit2Signature = (
  overrides: Partial<Permit2Args> = {},
): PermitRequirementSignature => {
  const args: Permit2Args = {
    owner: USER_A,
    asset: COLLATERAL_TOKEN,
    amount: 1n,
    nonce: 0n,
    deadline: 1_900_000_000n,
    expiration: 1_900_000_000n,
    signature: SIGNATURE,
    ...overrides,
  };

  return {
    action: {
      type: "permit2",
      args: {
        spender: getChainAddresses(CHAIN_ID).bundler3.generalAdapter1,
        amount: args.amount,
        deadline: args.deadline,
        expiration: args.expiration,
      },
    },
    args,
  };
};

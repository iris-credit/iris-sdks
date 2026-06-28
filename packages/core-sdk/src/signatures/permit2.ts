import type { Address, TypedDataDefinition } from "viem";
import type { ChainId } from "../chain.js";

import { getChainAddresses } from "../addresses.js";
import { MathLib } from "../math/index.js";

/** The permit data for a token. */
export type PermitDetails = {
  token: Address; // ERC20 token address.
  amount: bigint; // The maximum amount allowed to spend.
  expiration: number; // Timestamp at which a spender's token allowance becomes invalid.
  nonce: number; // An incrementing value indexed per owner, token, and spender for each signature.
};

/** The permit message signed for a single token allowance. */
export type PermitSingle = {
  details: PermitDetails;
  spender: Address;
  sigDeadline: bigint;
};

const permit2PermitTypes = {
  PermitSingle: [
    { name: "details", type: "PermitDetails" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
  PermitDetails: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
  ],
};

export const getPermit2PermitTypedData = (
  chainId: ChainId,
  permitSingle: PermitSingle,
): TypedDataDefinition<typeof permit2PermitTypes, "PermitSingle"> => {
  const { details, spender, sigDeadline } = permitSingle;

  return {
    domain: {
      name: "Permit2",
      chainId,
      verifyingContract: getChainAddresses(chainId).permit2,
    },
    types: permit2PermitTypes,
    message: {
      details: {
        token: details.token,
        amount: MathLib.min(details.amount, MathLib.MAX_UINT_160),
        expiration: MathLib.min(details.expiration, MathLib.MAX_UINT_48),
        nonce: details.nonce,
      },
      spender,
      sigDeadline,
    },
    primaryType: "PermitSingle",
  };
};

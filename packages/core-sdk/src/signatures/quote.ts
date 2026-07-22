import type { Address, Hex, TypedDataDefinition } from "viem";
import type { ChainId } from "../chain.js";

import { getChainAddresses } from "../addresses.js";

export type Quote = {
  borrower: Address;
  solver: Address;
  receiver: Address;
  blm: Address;
  collateralToken: Address;
  debtToken: Address;
  collateral: bigint;
  debt: bigint;
  fixedRate: bigint;
  duration: bigint;
  overdueRate: bigint;
  overduePeriod: bigint;
  bond: bigint;
  bondLltv: bigint;
  venueBitmap: bigint;
  venueId: bigint;
  deadline: bigint;
  nonce: bigint;
  data: Hex;
};

// Field order must match the contract's QUOTE_TYPEHASH; EIP-712 struct hashing is order-sensitive.
const quoteTypes = {
  Quote: [
    { name: "borrower", type: "address" },
    { name: "solver", type: "address" },
    { name: "receiver", type: "address" },
    { name: "blm", type: "address" },
    { name: "collateralToken", type: "address" },
    { name: "debtToken", type: "address" },
    { name: "collateral", type: "uint256" },
    { name: "debt", type: "uint256" },
    { name: "fixedRate", type: "uint256" },
    { name: "duration", type: "uint256" },
    { name: "overdueRate", type: "uint256" },
    { name: "overduePeriod", type: "uint256" },
    { name: "bond", type: "uint256" },
    { name: "bondLltv", type: "uint256" },
    { name: "venueBitmap", type: "uint256" },
    { name: "venueId", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "data", type: "bytes" },
  ],
} as const;

export const getQuoteTypedData = (
  chainId: ChainId,
  quote: Quote,
): TypedDataDefinition<typeof quoteTypes, "Quote"> => {
  return {
    domain: {
      chainId,
      verifyingContract: getChainAddresses(chainId).iris,
    },
    types: quoteTypes,
    message: quote,
    primaryType: "Quote",
  };
};

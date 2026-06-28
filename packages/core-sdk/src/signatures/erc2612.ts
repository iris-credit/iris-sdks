import type { Address, TypedDataDefinition } from "viem";
import type { ChainId } from "../chain.js";

/**
 * The EIP-712 domain of an ERC-20 token that implements EIP-2612.
 *
 * Unlike the iris-signed types, the `verifyingContract` here is the token itself,
 * and `name`/`version` are token-specific — they must be read from the token
 * (e.g. via `name()` / `eip712Domain()`), not assumed.
 */
export type Erc2612Domain = {
  token: Address; // The ERC-20 token contract; the EIP-712 verifyingContract.
  chainId: ChainId;
  name: string; // The token's EIP-712 domain name.
  version?: string; // The token's EIP-712 domain version (e.g. DAI "1", USDC "2"). Omit if the token's domain has none.
};

export type Erc2612Permit = {
  owner: Address; // The token holder granting the allowance.
  spender: Address; // The approved spender; for the iris flow this is the Iris contract.
  value: bigint; // The allowance amount.
  nonce: bigint; // The token's current EIP-2612 nonce for `owner` (read on-chain).
  deadline: bigint; // The timestamp after which the permit signature is no longer valid.
};

const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

export const getErc2612PermitTypedData = (
  domain: Erc2612Domain,
  permit: Erc2612Permit,
): TypedDataDefinition<typeof permitTypes, "Permit"> => {
  return {
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId,
      verifyingContract: domain.token,
    },
    types: permitTypes,
    message: permit,
    primaryType: "Permit",
  };
};

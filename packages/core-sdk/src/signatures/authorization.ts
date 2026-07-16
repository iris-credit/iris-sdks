import type { Address, TypedDataDefinition } from "viem";
import type { ChainId } from "../chain.js";

import { getChainAddresses } from "../addresses.js";

export type Authorization = {
  authorizer: Address; // The address of the user granting or revoking authorization.
  authorized: Address; // The address of the user being authorized or deauthorized.
  isAuthorized: boolean; // Whether to grant (true) or revoke (false) authorization.
  nonce: bigint; // A unique value to prevent replay attacks; random value not yet used (e.g. randomNonce()).
  deadline: bigint; // The timestamp after which the authorization is no longer valid.
};

const authorizationTypes = {
  Authorization: [
    { name: "authorizer", type: "address" },
    { name: "authorized", type: "address" },
    { name: "isAuthorized", type: "bool" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

export const getAuthorizationTypedData = (
  chainId: ChainId,
  authorization: Authorization,
): TypedDataDefinition<typeof authorizationTypes, "Authorization"> => {
  return {
    domain: {
      chainId,
      verifyingContract: getChainAddresses(chainId).iris,
    },
    types: authorizationTypes,
    message: authorization,
    primaryType: "Authorization",
  };
};

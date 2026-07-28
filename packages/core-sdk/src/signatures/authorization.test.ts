import { describe, expect, test } from "vitest";
import { SPENDER, USER } from "../../test/fixtures/iris.js";
import { CHAIN_ADDRESSES } from "../addresses.js";
import { ChainId } from "../chain.js";
import { getAuthorizationTypedData } from "./authorization.js";

const { iris } = CHAIN_ADDRESSES[ChainId.EthMainnet];

describe("getAuthorizationTypedData", () => {
  test("returns the Iris authorization typed data", () => {
    const typedData = getAuthorizationTypedData(ChainId.EthMainnet, {
      authorizer: USER,
      authorized: SPENDER,
      isAuthorized: true,
      nonce: 1n,
      deadline: 2n,
    });

    expect(typedData.domain?.verifyingContract).toBe(iris);
    expect(typedData.message).toEqual({
      authorizer: USER,
      authorized: SPENDER,
      isAuthorized: true,
      nonce: 1n,
      deadline: 2n,
    });
    expect(typedData.primaryType).toBe("Authorization");
  });

  test("scopes the domain to the chain id and the Iris deployment only", () => {
    const typedData = getAuthorizationTypedData(ChainId.EthMainnet, {
      authorizer: USER,
      authorized: SPENDER,
      isAuthorized: false,
      nonce: 3n,
      deadline: 4n,
    });

    expect(typedData.domain).toEqual({
      chainId: ChainId.EthMainnet,
      verifyingContract: iris,
    });
    expect(typedData.message.isAuthorized).toBe(false);
  });

  test("orders the Authorization fields as the contract typehash does", () => {
    const typedData = getAuthorizationTypedData(ChainId.EthMainnet, {
      authorizer: USER,
      authorized: SPENDER,
      isAuthorized: true,
      nonce: 1n,
      deadline: 2n,
    });

    expect(typedData.types.Authorization).toEqual([
      { name: "authorizer", type: "address" },
      { name: "authorized", type: "address" },
      { name: "isAuthorized", type: "bool" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ]);
  });
});

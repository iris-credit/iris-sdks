import { describe, expect } from "vitest";
import { randomAddress } from "@iris-credit/test";
import { irisAbi } from "../src/abis/iris.js";
import {
  ChainId,
  fetchIsNonceUsed,
  getAuthorizationTypedData,
  getChainAddresses,
} from "../src/index.js";
import { test } from "./setup.js";

const { iris } = getChainAddresses(ChainId.EthMainnet);

describe("fetchIsNonceUsed", () => {
  test("should fetch an unused nonce", { timeout: 30_000 }, async ({ client }) => {
    expect(await fetchIsNonceUsed(randomAddress(), 0n, client)).toBe(false);
  });

  test("should fetch a used nonce", { timeout: 30_000 }, async ({ client }) => {
    const authorization = {
      authorizer: client.account.address,
      authorized: randomAddress(),
      isAuthorized: true,
      nonce: 0n,
      deadline: (await client.timestamp()) + 3_600n,
    };

    const signature = await client.signTypedData(
      getAuthorizationTypedData(ChainId.EthMainnet, authorization),
    );
    await client.writeContract({
      address: iris,
      abi: irisAbi,
      functionName: "setAuthorizationWithSig",
      args: [authorization, signature],
    });

    expect(await fetchIsNonceUsed(authorization.authorizer, 0n, client)).toBe(true);
  });
});

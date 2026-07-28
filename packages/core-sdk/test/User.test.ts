import { describe, expect } from "vitest";
import { randomAddress } from "@iris-credit/test";
import { irisAbi } from "../src/abis/iris.js";
import { User } from "../src/augment/User.js";
import {
  ChainId,
  fetchIsNonceUsed,
  fetchUser,
  getAuthorizationTypedData,
  getChainAddresses,
} from "../src/index.js";
import { test } from "./setup.js";

const { iris, bundler3 } = getChainAddresses(ChainId.EthMainnet);

describe("fetchUser", () => {
  test("should report an unauthorized user", { timeout: 30_000 }, async ({ client }) => {
    const address = randomAddress();

    expect(await fetchUser(address, client)).toStrictEqual(
      new User({ address, isBundlerAuthorized: false }),
    );
  });

  test(
    "should report a user who authorized the general adapter",
    { timeout: 30_000 },
    async ({ client }) => {
      const authorization = {
        authorizer: client.account.address,
        authorized: bundler3.generalAdapter1,
        isAuthorized: true,
        nonce: 1n,
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

      expect((await fetchUser(client.account.address, client)).isBundlerAuthorized).toBe(true);
    },
  );

  test(
    "should expose the same read through the augmented static",
    { timeout: 30_000 },
    async ({ client }) => {
      const address = randomAddress();

      expect(await User.fetch(address, client)).toStrictEqual(
        new User({ address, isBundlerAuthorized: false }),
      );
    },
  );
});

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

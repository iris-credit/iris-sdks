import { describe, expect } from "vitest";
import { randomAddress } from "@iris-credit/test";
import { irisAbi } from "../src/abis/iris.js";
import { User } from "../src/augment/User.js";
import {
  ChainId,
  fetchIsQuoteNonceUsed,
  fetchUser,
  getAuthorizationTypedData,
  getChainAddresses,
} from "../src/index.js";
import { test } from "./setup.js";

const { iris, bundler3 } = getChainAddresses(ChainId.EthMainnet);

describe("fetchUser", () => {
  // Skipped until the guardian-audit Iris is deployed: the mainnet Iris at the fork block predates
  // `nonce` and reverts on the new selector. Re-enable with the address/fork-block update.
  test.skip("should report an unauthorized user", { timeout: 30_000 }, async ({ client }) => {
    const address = randomAddress();

    expect(await fetchUser(address, client)).toStrictEqual(
      new User({ address, isBundlerAuthorized: false, nonce: 0n }),
    );
  });

  test.skip(
    "should report a user who authorized the general adapter",
    { timeout: 30_000 },
    async ({ client }) => {
      const authorization = {
        authorizer: client.account.address,
        authorized: bundler3.generalAdapter1,
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

      expect(await fetchUser(client.account.address, client)).toStrictEqual(
        new User({ address: client.account.address, isBundlerAuthorized: true, nonce: 1n }),
      );
    },
  );

  test.skip(
    "should expose the same read through the augmented static",
    { timeout: 30_000 },
    async ({ client }) => {
      const address = randomAddress();

      expect(await User.fetch(address, client)).toStrictEqual(
        new User({ address, isBundlerAuthorized: false, nonce: 0n }),
      );
    },
  );
});

describe("fetchIsQuoteNonceUsed", () => {
  // Skipped until the guardian-audit Iris is deployed: the mainnet Iris at the fork block predates
  // `isQuoteNonceUsed` and reverts on the new selector. Re-enable with the address/fork-block update.
  test.skip("should fetch an unused nonce", { timeout: 30_000 }, async ({ client }) => {
    expect(await fetchIsQuoteNonceUsed(randomAddress(), 0n, client)).toBe(false);
  });
});

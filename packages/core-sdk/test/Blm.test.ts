import { parseEther } from "viem";
import { describe, expect } from "vitest";
import { randomAddress } from "@iris-credit/test";
import { irisAbi } from "../src/abis/iris.js";
import { whitelistBlmAbi } from "../src/abis/whitelist-blm.js";
import { Blm } from "../src/augment/Blm.js";
import { ChainId, fetchIsWhitelisted, getChainAddresses } from "../src/index.js";
import { test } from "./setup.js";

const { iris, blm, whitelistBlm, tokens } = getChainAddresses(ChainId.EthMainnet);

describe("augment/Blm", () => {
  test("should fetch blm data", { timeout: 30_000 }, async ({ client }) => {
    const expectedData = new Blm({
      address: blm,
      token: tokens.USDC,
      slope: 10_000_000_000_000_000n,
      intercept: 5_000_000_000_000_000n,
    });

    const value = await Blm.fetch(blm, tokens.USDC, client);

    expect(value).toStrictEqual(expectedData);
  });

  test("should carry a caller-provided whitelist", { timeout: 30_000 }, async ({ client }) => {
    const whitelisted = randomAddress();

    const value = await Blm.fetch(whitelistBlm, tokens.USDC, client);
    value.whitelist = [whitelisted];

    expect(value.whitelist).toStrictEqual([whitelisted]);
    expect(value.isWhitelisted(whitelisted)).toBe(true);
    expect(value.isWhitelisted(randomAddress())).toBe(false);
  });

  test("should compute the bond requirement", { timeout: 30_000 }, async ({ client }) => {
    const value = await Blm.fetch(blm, tokens.USDC, client);

    // ratio = 0.01 WAD/day * 30 days + 0.005 WAD; bond = 1_000e6 * ratio.
    expect(value.bondRequirement({ debt: 1_000_000_000n, duration: 2_592_000n })).toBe(
      305_000_000n,
    );
  });
});

describe("fetchIsWhitelisted", () => {
  test("should fetch a missing whitelist entry", { timeout: 30_000 }, async ({ client }) => {
    expect(await fetchIsWhitelisted(whitelistBlm, randomAddress(), client)).toBe(false);
  });

  test("should fetch a whitelist entry", { timeout: 30_000 }, async ({ client }) => {
    const account = randomAddress();

    const owner = await client.readContract({ address: iris, abi: irisAbi, functionName: "owner" });
    await client.impersonateAccount({ address: owner });
    await client.setBalance({ address: owner, value: parseEther("1") });
    await client.writeContract({
      account: owner,
      address: whitelistBlm,
      abi: whitelistBlmAbi,
      functionName: "setIsWhitelisted",
      args: [account, true],
    });

    expect(await fetchIsWhitelisted(whitelistBlm, account, client)).toBe(true);
  });

  test("should throw on a plain-flavor blm", { timeout: 30_000 }, async ({ client }) => {
    // `Blm` has no `isWhitelisted` getter.
    await expect(fetchIsWhitelisted(blm, randomAddress(), client)).rejects.toThrow();
  });
});

import { parseEther } from "viem";
import { describe, expect } from "vitest";
import { randomAddress } from "@iris-credit/test";
import { irisAbi } from "../src/abis/iris.js";
import { Config } from "../src/augment/Config.js";
import {
  ChainId,
  fetchIsBlmEnabled,
  fetchIsBondLltvEnabled,
  fetchIsDataEnabled,
  getChainAddresses,
} from "../src/index.js";
import { test } from "./setup.js";

const { iris, blm, whitelistBlm } = getChainAddresses(ChainId.EthMainnet);

describe("augment/Config", () => {
  test("should fetch config", { timeout: 30_000 }, async ({ client }) => {
    const expectedData = new Config({
      fee: 100_000_000_000_000_000n,
      feeRecipient: "0xC114D3109A8Cc85B40BA231cDA11c1d815654C7d",
    });

    const value = await Config.fetch(client);

    expect(value).toStrictEqual(expectedData);
  });
});

describe("fetchIsBlmEnabled", () => {
  test("should fetch an enabled blm", { timeout: 30_000 }, async ({ client }) => {
    expect(await fetchIsBlmEnabled(blm, client)).toBe(true);
  });

  test("should fetch a non-enabled blm", { timeout: 30_000 }, async ({ client }) => {
    expect(await fetchIsBlmEnabled(whitelistBlm, client)).toBe(false);
    expect(await fetchIsBlmEnabled(randomAddress(), client)).toBe(false);
  });

  test("should fetch a newly enabled blm", { timeout: 30_000 }, async ({ client }) => {
    const owner = await client.readContract({ address: iris, abi: irisAbi, functionName: "owner" });
    await client.impersonateAccount({ address: owner });
    await client.setBalance({ address: owner, value: parseEther("1") });
    await client.writeContract({
      account: owner,
      address: iris,
      abi: irisAbi,
      functionName: "enableBlm",
      args: [whitelistBlm],
    });

    expect(await fetchIsBlmEnabled(whitelistBlm, client)).toBe(true);
  });
});

describe("fetchIsBondLltvEnabled", () => {
  test("should fetch an enabled bond lltv", { timeout: 30_000 }, async ({ client }) => {
    expect(await fetchIsBondLltvEnabled(900_000_000_000_000_000n, client)).toBe(true);
  });

  test("should fetch a non-enabled bond lltv", { timeout: 30_000 }, async ({ client }) => {
    expect(await fetchIsBondLltvEnabled(800_000_000_000_000_000n, client)).toBe(false);
  });

  test("should fetch a newly enabled bond lltv", { timeout: 30_000 }, async ({ client }) => {
    const owner = await client.readContract({ address: iris, abi: irisAbi, functionName: "owner" });
    await client.impersonateAccount({ address: owner });
    await client.setBalance({ address: owner, value: parseEther("1") });
    await client.writeContract({
      account: owner,
      address: iris,
      abi: irisAbi,
      functionName: "enableBondLltv",
      args: [800_000_000_000_000_000n],
    });

    expect(await fetchIsBondLltvEnabled(800_000_000_000_000_000n, client)).toBe(true);
  });
});

describe("fetchIsDataEnabled", () => {
  test("should fetch enabled market data", { timeout: 30_000 }, async ({ client }) => {
    // The Aave v3 venue's enabled payload is empty bytes.
    expect(await fetchIsDataEnabled("0x", client)).toBe(true);
  });

  test("should fetch non-enabled market data", { timeout: 30_000 }, async ({ client }) => {
    expect(await fetchIsDataEnabled("0xdead", client)).toBe(false);
  });
});

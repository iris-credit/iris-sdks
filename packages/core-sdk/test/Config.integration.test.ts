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

/** The protocol Safe, set as the fee recipient at the pinned block. */
const feeRecipient = "0x6811c4463C3B725fa1314e50855405a241028c49";

describe("augment/Config", () => {
  test("should fetch config", { timeout: 30_000 }, async ({ client }) => {
    const value = await Config.fetch(client);

    expect(value).toStrictEqual(new Config({ fee: 0n, feeRecipient }));
  });

  test("should scale a set fee back to WAD", { timeout: 30_000 }, async ({ client }) => {
    // The contract stores the fee in BP, so a nonzero fee pins the scaling.
    const fee = 100_000_000_000_000_000n;
    const owner = await client.readContract({ address: iris, abi: irisAbi, functionName: "owner" });
    await client.impersonateAccount({ address: owner });
    await client.setBalance({ address: owner, value: parseEther("1") });
    await client.writeContract({
      account: owner,
      address: iris,
      abi: irisAbi,
      functionName: "setFee",
      args: [fee],
    });

    const value = await Config.fetch(client);

    expect(value).toStrictEqual(new Config({ fee, feeRecipient }));
  });
});

describe("fetchIsBlmEnabled", () => {
  test("should fetch an enabled blm", { timeout: 30_000 }, async ({ client }) => {
    expect(await fetchIsBlmEnabled(blm, client)).toBe(true);
  });

  test("should fetch a non-enabled blm", { timeout: 30_000 }, async ({ client }) => {
    expect(await fetchIsBlmEnabled(randomAddress(), client)).toBe(false);
    // Deployed but not enabled at the pinned block.
    expect(await fetchIsBlmEnabled(whitelistBlm, client)).toBe(false);
  });

  test("should fetch a newly enabled blm", { timeout: 30_000 }, async ({ client }) => {
    const newBlm = randomAddress();
    const owner = await client.readContract({ address: iris, abi: irisAbi, functionName: "owner" });
    await client.impersonateAccount({ address: owner });
    await client.setBalance({ address: owner, value: parseEther("1") });
    await client.writeContract({
      account: owner,
      address: iris,
      abi: irisAbi,
      functionName: "enableBlm",
      args: [newBlm],
    });

    expect(await fetchIsBlmEnabled(newBlm, client)).toBe(true);
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
    // The Aave v3 and SparkLend venues' enabled payload is empty bytes.
    expect(await fetchIsDataEnabled("0x", client)).toBe(true);
  });

  test("should fetch non-enabled market data", { timeout: 30_000 }, async ({ client }) => {
    expect(await fetchIsDataEnabled("0xdead", client)).toBe(false);
  });
});

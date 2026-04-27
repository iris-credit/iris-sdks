import { isAddress } from "viem";
import { describe, expect, it } from "vitest";
import { spawnAnvil } from "../src/anvil.js";
import { randomAddress, testAccount } from "../src/fixtures.js";

describe("fixtures", () => {
  it("should return a deterministic random address", () => {
    const addr1 = randomAddress();
    const addr2 = randomAddress();

    expect(isAddress(addr1)).toBe(true);
    expect(isAddress(addr2)).toBe(true);
    expect(addr1).not.toBe(addr2);
  });

  it("should return a valid test account", () => {
    const account = testAccount();

    expect(isAddress(account.address)).toBe(true);
    expect(account.address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });

  it("should return different accounts for different indices", () => {
    const account0 = testAccount(0);
    const account1 = testAccount(1);

    expect(account0.address).not.toBe(account1.address);
  });
});

describe("anvil", () => {
  it("should spawn and stop anvil", { timeout: 15_000 }, async () => {
    const { rpcUrl, stop } = await spawnAnvil({ port: 0 });

    expect(rpcUrl).toMatch(/^http:\/\/localhost:\d+$/);

    const stopped = stop();
    expect(stopped).toBe(true);
  });
});

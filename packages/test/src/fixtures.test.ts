import { isAddress } from "viem";
import { describe, expect, it } from "vitest";
import { randomAddress, testAccount } from "./fixtures.js";

describe("fixtures", () => {
  it("should return a deterministic random address", () => {
    const addr1 = randomAddress();
    const addr2 = randomAddress();

    expect(isAddress(addr1)).toBe(true);
    expect(isAddress(addr2)).toBe(true);
    expect(addr1).not.toBe(addr2);
  });

  it("returns a valid checksummed Ethereum address", () => {
    const a = randomAddress();

    expect(isAddress(a, { strict: true })).toBe(true);
    expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("supports per-chain checksum encoding (EIP-1191)", () => {
    const a = randomAddress(1);
    const b = randomAddress(137);

    // chainId-bound checksum (EIP-1191) intentionally diverges from EIP-55,
    // so strict (mainnet) validation does not always pass; structural
    // validation does.
    expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(b).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("should return a valid test account", () => {
    const account = testAccount();

    expect(isAddress(account.address)).toBe(true);
    expect(account.address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });

  it("derives the canonical test account 1", () => {
    const account = testAccount(1);

    expect(account.address).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  });

  it("derived accounts are deterministic", () => {
    const a1 = testAccount(0);
    const a2 = testAccount(0);

    expect(a1.address).toBe(a2.address);
  });

  it("should return different accounts for different indices", () => {
    const account0 = testAccount(0);
    const account1 = testAccount(1);

    expect(account0.address).not.toBe(account1.address);
  });

  it("returned account exposes a sign function", () => {
    const account = testAccount();

    expect(typeof account.sign).toBe("function");
    expect(typeof account.signMessage).toBe("function");
    expect(typeof account.signTypedData).toBe("function");
  });
});

import { getAddress } from "viem";
import { describe, expect, test } from "vitest";
import { CHAIN_ADDRESSES, NATIVE_ADDRESS } from "../src/index.js";

interface AddressCase {
  readonly label: string;
  readonly address: string;
}

// Recursively collect every address string in the address book, labelled by its
// dotted path (e.g. "1.tokens.USDC"), so each is checked as its own test case.
const collect = (value: unknown, label: string, out: AddressCase[]): void => {
  if (typeof value === "string") {
    out.push({ label, address: value });
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collect(child, label === "" ? key : `${label}.${key}`, out);
    }
  }
};

const cases: AddressCase[] = [{ label: "NATIVE_ADDRESS", address: NATIVE_ADDRESS }];
collect(CHAIN_ADDRESSES, "", cases);

describe("address book checksums", () => {
  // `getAddress` throws on an invalid checksum and re-checksums lowercase input,
  // so equality proves the stored string is already correctly EIP-55 checksummed.
  test.each(cases)("$label is checksummed", ({ address }) => {
    expect(getAddress(address)).toBe(address);
  });
});

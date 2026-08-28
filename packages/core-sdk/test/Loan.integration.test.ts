import { zeroAddress } from "viem";
import { describe, expect } from "vitest";
import { randomAddress } from "@iris-credit/test";
import { Loan } from "../src/augment/Loan.js";
import { fetchLoan } from "../src/index.js";
import { test } from "./setup.js";

/** A pod holding no loan: every field of the `Loan` struct reads as zero. */
const zeroedLoan = (pod: `0x${string}`) =>
  new Loan({
    pod,
    borrower: zeroAddress,
    solver: zeroAddress,
    collateralToken: zeroAddress,
    debtToken: zeroAddress,
    venueBitmap: 0n,
    maturity: 0n,
    overduePeriod: 0n,
    fixedRate: 0n,
    overdueRate: 0n,
    bondLltv: 0n,
    fee: 0n,
  });

describe("fetchLoan (mainnet fork)", () => {
  test(
    "should decode a pod with no loan as a zeroed entity",
    { timeout: 30_000 },
    async ({ client }) => {
      // Pins the hand-written `getLoan` abi against the deployed contract: a field
      // reordering or a width change would surface as a decode failure here.
      const pod = randomAddress();

      expect(await fetchLoan(pod, client)).toStrictEqual(zeroedLoan(pod));
    },
  );

  test(
    "should expose the same read through the augmented static",
    { timeout: 30_000 },
    async ({ client }) => {
      const pod = randomAddress();

      expect(await Loan.fetch(pod, client)).toStrictEqual(zeroedLoan(pod));
    },
  );

  test("should resolve the chain id from the client", { timeout: 30_000 }, async ({ client }) => {
    const pod = randomAddress();

    // No `chainId` passed: the fetcher resolves it from the fork and still finds Iris.
    expect((await fetchLoan(pod, client)).pod).toBe(pod);
  });
});

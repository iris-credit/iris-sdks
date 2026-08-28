import { describe, expect } from "vitest";
import { randomAddress } from "@iris-credit/test";
import { Position } from "../src/augment/Position.js";
import { fetchAccrualPosition, fetchPosition } from "../src/index.js";
import { test } from "./setup.js";

/** A pod holding no loan: every field of the `Position` struct reads as zero. */
const zeroedPosition = (pod: `0x${string}`) =>
  new Position({
    pod,
    collateral: 0n,
    debt: 0n,
    bond: 0n,
    bondRequirement: 0n,
    collateralIndex: 0n,
    debtIndex: 0n,
    fixedLeg: 0n,
    floatingLeg: 0n,
    surplus: 0n,
    lastUpdate: 0n,
    venueId: 0n,
    data: "0x",
  });

describe("fetchPosition (mainnet fork)", () => {
  test(
    "should decode a pod with no loan as a zeroed entity",
    { timeout: 30_000 },
    async ({ client }) => {
      // Pins the hand-written `getPosition` abi against the deployed contract.
      const pod = randomAddress();

      expect(await fetchPosition(pod, client)).toStrictEqual(zeroedPosition(pod));
    },
  );

  test(
    "should expose the same read through the augmented static",
    { timeout: 30_000 },
    async ({ client }) => {
      const pod = randomAddress();

      expect(await Position.fetch(pod, client)).toStrictEqual(zeroedPosition(pod));
    },
  );
});

describe("fetchAccrualPosition (mainnet fork)", () => {
  test("should fail on a pod with no loan", { timeout: 30_000 }, async ({ client }) => {
    // A zeroed position points at venue 0 with empty data and zero tokens; the venue
    // adapter reverts rather than reporting an empty position, so no accrual-ready
    // entity exists for a pod that never took a loan.
    await expect(fetchAccrualPosition(randomAddress(), client)).rejects.toThrow();
  });
});

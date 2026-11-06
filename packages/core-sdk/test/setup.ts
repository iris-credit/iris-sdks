import { mainnet } from "viem/chains";
import { createViemTest } from "@iris-credit/test/vitest";

/**
 * This test will run on `mainnet` forked at block `26_354_500`, where the Iris launch deployment
 * carries its launch config (blocks `26_354_428`-`26_354_444`) and is owned by the Timelock
 * (block `26_354_479`). `MAINNET_RPC_URL` overrides the fork RPC; defaults to a public archive
 * endpoint (viem's default RPC bot-blocks anvil's requests).
 */
export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL || "https://eth.drpc.org",
  forkBlockNumber: 26_354_500,
});

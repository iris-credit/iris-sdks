import { mainnet } from "viem/chains";
import { createViemTest } from "../src/vitest.js";

/**
 * This test will run on `mainnet` forked at block `25_572_460`. `MAINNET_RPC_URL` overrides
 * the fork RPC; defaults to a public archive endpoint (viem's default RPC bot-blocks anvil's
 * requests).
 */
export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL || "https://eth.drpc.org",
  forkBlockNumber: 25_572_460,
});

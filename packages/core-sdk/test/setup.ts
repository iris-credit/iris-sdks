import { mainnet } from "viem/chains";
import { createViemTest } from "@iris-credit/test/vitest";

/**
 * This test will run on `mainnet` forked at block `25_530_000`, after the Iris deployment
 * (block `25_442_833`) and its initial configuration enablement. `MAINNET_RPC_URL` overrides the
 * fork RPC; defaults to a public archive endpoint (viem's default RPC bot-blocks anvil's requests).
 */
export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL || "https://eth.drpc.org",
  forkBlockNumber: 25_530_000,
});

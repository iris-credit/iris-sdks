import { mainnet } from "viem/chains";
import { createViemTest } from "@iris-credit/test/vitest";

/**
 * This test will run on `mainnet` forked at block `25_572_460`, after the Jul 20 Iris
 * redeployment (blocks `25_572_158`-`25_572_166`) and the redeployed BLMs' enablement and
 * params (through block `25_572_453`). `MAINNET_RPC_URL` overrides the fork RPC; defaults to
 * a public archive endpoint (viem's default RPC bot-blocks anvil's requests).
 */
export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL || "https://eth.drpc.org",
  forkBlockNumber: 25_572_460,
});

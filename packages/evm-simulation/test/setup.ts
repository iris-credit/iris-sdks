import type { AnvilTestClient } from "@iris-credit/test";

import { mainnet } from "viem/chains";
import { createViemTest } from "@iris-credit/test/vitest";

/**
 * Fork-test fixture pinned to the same `mainnet` block as `core-sdk`'s suite, so both
 * share one anvil state cache. `MAINNET_RPC_URL` overrides the fork RPC; defaults to a
 * public archive endpoint (viem's default RPC bot-blocks anvil's requests).
 */
export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL || "https://eth.drpc.org",
  forkBlockNumber: 25_572_460,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    // The well-known test account may carry EIP-7702 delegation code on mainnet (its
    // private key is public); wipe it so it behaves as a plain EOA during simulation.
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await use(client);
  },
});

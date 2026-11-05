import type { AnvilTestClient } from "@iris-credit/test";

import { mainnet } from "viem/chains";
import { createViemTest } from "@iris-credit/test/vitest";
import { applyLaunchConfig } from "./helpers/launchConfig.js";

/**
 * This test will run on `mainnet` forked at block `26_348_709`, the last block of the Nov 5
 * Iris launch deployment (blocks `26_348_666`-`26_348_709`). `MAINNET_RPC_URL` overrides the
 * fork RPC; defaults to a public archive endpoint (viem's default RPC bot-blocks anvil's
 * requests).
 */
export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL || "https://eth.drpc.org",
  forkBlockNumber: 26_348_709,
});

/**
 * {@link test} with the launch config applied to the fork first: nothing is configured on Iris
 * at the pinned block. See {@link applyLaunchConfig}.
 */
export const configuredTest = test.extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    await applyLaunchConfig(client);
    await use(client);
  },
});

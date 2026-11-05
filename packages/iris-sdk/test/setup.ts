import type { AnvilTestClient } from "@iris-credit/test";

import { mainnet } from "viem/chains";
import { createViemTest } from "@iris-credit/test/vitest";

/**
 * This test will run on `mainnet` forked at block `26_348_709`, the last block of the Nov 5
 * Iris launch deployment (blocks `26_348_666`-`26_348_709`), shared with `core-sdk`'s suite.
 * `MAINNET_RPC_URL` overrides the fork RPC; defaults to a public archive endpoint (viem's
 * default RPC bot-blocks anvil's requests).
 */
export const test = createViemTest(mainnet, {
  forkUrl: process.env.MAINNET_RPC_URL || "https://eth.drpc.org",
  forkBlockNumber: 26_348_709,
}).extend<{ client: AnvilTestClient<typeof mainnet> }>({
  client: async ({ client }, use) => {
    // The test account (0xf39Fd6…) carries EIP-7702 delegation code on mainnet at this fork
    // block, so signature checkers see code and take the ERC-1271 path instead of ecrecover,
    // breaking every permit signature. The cleanup in createViemTest (signAuthorization →
    // zeroAddress) does not fully clear the bytecode, so we wipe it explicitly.
    await client.setCode({ address: client.account.address, bytecode: "0x" });

    await use(client);
  },
});

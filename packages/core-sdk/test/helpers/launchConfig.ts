import type { Address, Hex } from "viem";
import type { mainnet } from "viem/chains";
import type { AnvilTestClient } from "@iris-credit/test";

import { keccak256, parseEther } from "viem";
import { irisAbi } from "../../src/abis/iris.js";
import { ChainId, getChainAddresses } from "../../src/index.js";

const { iris, blm, aaveV3Adapter, morphoBlueAdapter, sparkLendAdapter } = getChainAddresses(
  ChainId.EthMainnet,
);

/**
 * The mainnet launch config (iris-core `config/ethereum.json`), transcribed from there rather
 * than derived from `CHAIN_REGISTRIES`, so the registry suite checks one against the other.
 *
 * @internal
 */
export const LAUNCH_CONFIG = {
  venueAdapters: [
    [0n, aaveV3Adapter],
    [1n, morphoBlueAdapter],
    [2n, sparkLendAdapter],
  ] as const satisfies readonly (readonly [bigint, Address])[],
  /** Enabled hashes: `keccak256("0x")` for the Aave V3 and SparkLend venues, then the Morpho
   * market ids. */
  dataHashes: [
    keccak256("0x"),
    // WBTC/USDC.
    "0x3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49",
    // cbBTC/USDC.
    "0x64d65c9a2d91c36d56fbc42d69e979335320169b3df63bf92789e2c8883fcc64",
    // wstETH/USDT.
    "0xe7e9694b754c4d4f7e21faf7223f6fa71abaeb10296a4c43a54a7977149687d2",
  ] as const satisfies readonly Hex[],
  // TODO(launch-config): add `whitelistBlm` if the launch config gives it params.
  blms: [blm] as const satisfies readonly Address[],
  // TODO(launch-config): placeholder, matching the registry's; the launch bond LLTVs are
  // undecided.
  bondLltvs: [900_000_000_000_000_000n] as const satisfies readonly bigint[],
} as const;

/**
 * Applies {@link LAUNCH_CONFIG} to the fork as the Iris owner. Nothing is configured on the
 * launch deployment at the pinned block, so suites that read enabled state (venue adapters,
 * market data, BLMs, bond LLTVs) run against this simulation of it. BLM params, the fee and
 * the fee recipient are undecided and left unset: tests that need them set their own.
 *
 * TODO(launch-config): once the launch config is live onchain, re-pin the fork past it and
 * delete this helper, so those suites read the real configuration.
 *
 * @internal
 */
export async function applyLaunchConfig(client: AnvilTestClient<typeof mainnet>) {
  const owner = await client.readContract({ address: iris, abi: irisAbi, functionName: "owner" });
  await client.impersonateAccount({ address: owner });
  await client.setBalance({ address: owner, value: parseEther("1") });

  const call = { account: owner, address: iris, abi: irisAbi } as const;
  for (const [venueId, adapter] of LAUNCH_CONFIG.venueAdapters)
    await client.writeContract({
      ...call,
      functionName: "setVenueAdapter",
      args: [venueId, adapter],
    });
  for (const dataHash of LAUNCH_CONFIG.dataHashes)
    await client.writeContract({ ...call, functionName: "enableData", args: [dataHash] });
  for (const enabledBlm of LAUNCH_CONFIG.blms)
    await client.writeContract({ ...call, functionName: "enableBlm", args: [enabledBlm] });
  for (const lltv of LAUNCH_CONFIG.bondLltvs)
    await client.writeContract({ ...call, functionName: "enableBondLltv", args: [lltv] });
}

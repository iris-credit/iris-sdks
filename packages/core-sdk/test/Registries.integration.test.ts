import { zeroAddress } from "viem";
import { describe, expect } from "vitest";
import { irisAbi } from "../src/abis/iris.js";
import {
  ChainId,
  fetchIsBlmEnabled,
  fetchIsBondLltvEnabled,
  fetchIsDataEnabled,
  getChainAddresses,
  getChainRegistry,
} from "../src/index.js";
import { test } from "./setup.js";

const { iris } = getChainAddresses(ChainId.EthMainnet);
const registry = getChainRegistry(ChainId.EthMainnet);

// Soundness of the shipped registry: every entry must be enabled onchain at the pinned block.
// Completeness (nothing enabled onchain is missing here) is checked release-side against
// api.iris.credit instead, since it cannot be read from point getters.
describe("CHAIN_REGISTRIES", () => {
  test("should record enabled bond lltvs", { timeout: 30_000 }, async ({ client }) => {
    for (const lltv of registry.bondLltvs)
      expect(await fetchIsBondLltvEnabled(lltv, client)).toBe(true);
  });

  test("should record enabled blms", { timeout: 30_000 }, async ({ client }) => {
    for (const blm of Object.values(registry.blms))
      expect(await fetchIsBlmEnabled(blm, client)).toBe(true);
  });

  test("should record enabled market datas", { timeout: 30_000 }, async ({ client }) => {
    for (const { data } of Object.values(registry.marketDatas))
      expect(await fetchIsDataEnabled(data, client)).toBe(true);
  });

  test("should record registered venues", { timeout: 30_000 }, async ({ client }) => {
    for (const venueId of Object.values(registry.venues)) {
      const adapter = await client.readContract({
        address: iris,
        abi: irisAbi,
        functionName: "venueAdapter",
        args: [venueId],
      });

      expect(adapter).not.toBe(zeroAddress);
    }
  });
});

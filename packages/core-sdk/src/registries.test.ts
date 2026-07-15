import { getAddress, keccak256 } from "viem";
import { describe, expect, test } from "vitest";
import { ChainId } from "./chain.js";
import { BP } from "./constants.js";
import { UnsupportedChainIdError } from "./errors.js";
import { MathLib } from "./math/index.js";
import { CHAIN_REGISTRIES, getChainRegistry } from "./registries.js";

/** Onchain-enabled `keccak256(data)` hashes backing each market data label. */
const ENABLED_DATA_HASHES: Record<string, `0x${string}`> = {
  aaveV3: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
  "morphoBlue:WBTC/USDC": "0x3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49",
  "morphoBlue:cbBTC/USDC": "0x64d65c9a2d91c36d56fbc42d69e979335320169b3df63bf92789e2c8883fcc64",
  "morphoBlue:wstETH/USDT": "0xe7e9694b754c4d4f7e21faf7223f6fa71abaeb10296a4c43a54a7977149687d2",
};

const registries = Object.entries(CHAIN_REGISTRIES) as [
  string,
  ReturnType<typeof getChainRegistry>,
][];

describe("CHAIN_REGISTRIES", () => {
  test.each(registries)(
    "should hash market data preimages to enabled hashes on chain %s",
    (_, registry) => {
      for (const [label, { data }] of Object.entries(registry.marketDatas))
        expect(keccak256(data)).toBe(ENABLED_DATA_HASHES[label]);
    },
  );

  test.each(registries)(
    "should reference registered venues from market datas on chain %s",
    (_, registry) => {
      for (const { venue } of Object.values(registry.marketDatas))
        expect(registry.venues).toHaveProperty(venue);
    },
  );

  test.each(registries)("should record valid venue ids on chain %s", (_, registry) => {
    const venueIds = Object.values(registry.venues);

    expect(new Set(venueIds).size).toBe(venueIds.length);
    for (const venueId of venueIds) {
      expect(venueId).toBeGreaterThanOrEqual(0n);
      // `setVenueAdapter` requires `venueId < 128`.
      expect(venueId).toBeLessThan(128n);
    }
  });

  test.each(registries)("should record valid bond lltvs on chain %s", (_, registry) => {
    expect(new Set(registry.bondLltvs).size).toBe(registry.bondLltvs.length);
    for (const lltv of registry.bondLltvs) {
      // `enableBondLltv` requires `lltv < WAD` and `lltv % BP == 0`.
      expect(lltv).toBeGreaterThan(0n);
      expect(lltv).toBeLessThan(MathLib.WAD);
      expect(lltv % BP).toBe(0n);
    }
  });

  test.each(registries)("should record checksummed blm addresses on chain %s", (_, registry) => {
    for (const blm of Object.values(registry.blms)) expect(getAddress(blm)).toBe(blm);
  });
});

describe("getChainRegistry", () => {
  test("should return the registry for a supported chain id", () => {
    expect(getChainRegistry(ChainId.EthMainnet)).toBe(CHAIN_REGISTRIES[ChainId.EthMainnet]);
  });

  test("should throw for an unsupported chain id", () => {
    expect(() => getChainRegistry(999 as ChainId)).toThrow(UnsupportedChainIdError);
  });
});

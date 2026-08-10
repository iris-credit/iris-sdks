import { getAddress, keccak256 } from "viem";
import { describe, expect, test } from "vitest";
import { ChainId } from "./chain.js";
import { BP } from "./constants.js";
import { UnknownDataHashError, UnsupportedChainIdError } from "./errors.js";
import { MathLib } from "./math/index.js";
import { CHAIN_REGISTRIES, getChainRegistry, getMarketData } from "./registries.js";

const registries = Object.entries(CHAIN_REGISTRIES) as [
  string,
  ReturnType<typeof getChainRegistry>,
][];

describe("CHAIN_REGISTRIES", () => {
  test.each(registries)(
    "should key market data preimages by their enabled hash on chain %s",
    (_, registry) => {
      for (const [hash, { data }] of Object.entries(registry.marketDatas))
        expect(keccak256(data)).toBe(hash);
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

describe("getMarketData", () => {
  test("should index an enabled payload by a runtime hash", () => {
    expect(getMarketData(ChainId.EthMainnet, keccak256("0x"))).toEqual({
      venue: "aaveV3",
      data: "0x",
    });
  });

  test("should ignore the case of the looked-up hash", () => {
    expect(
      getMarketData(ChainId.EthMainnet, `0x${keccak256("0x").slice(2).toUpperCase()}`),
    ).toEqual({ venue: "aaveV3", data: "0x" });
  });

  test("should throw for a hash that is not enabled", () => {
    expect(() => getMarketData(ChainId.EthMainnet, keccak256("0xdeadbeef"))).toThrow(
      UnknownDataHashError,
    );
  });
});

import type { Address, Hex } from "viem";

import { CHAIN_ADDRESSES } from "./addresses.js";
import { ChainId } from "./chain.js";
import { UnsupportedChainIdError } from "./errors.js";

/* Per-chain registry of values enabled on the Iris contract (as opposed to `CHAIN_ADDRESSES`,
 * which records what is deployed — e.g. `whitelistBlm` is deployed but not enabled).
 *
 * Enablement is append-only onchain (`enableBlm`/`enableBondLltv`/`enableData` have no disable
 * path, and `setVenueAdapter` can never unregister a venue id), so entries can only ever be
 * stale-incomplete — missing values enabled after the SDK release — never stale-wrong. Solvers
 * can therefore quote from this registry offline; fetchers re-verify the mutable state (BLM
 * params, whitelist entries, fee) at runtime.
 *
 * Market data payloads are recorded as preimages because the contract only stores
 * `keccak256(data)`: the hashes are unrecoverable from onchain or indexed state, so newly
 * enabled payloads must be added here from the enablement (ops) side.
 */

/** A market data payload enabled on Iris. */
export interface MarketData {
  /** Name of the venue the payload targets; a key of the chain registry's `venues`. */
  readonly venue: string;
  /** Raw `quote.data` bytes; the contract enables `keccak256(data)`. */
  readonly data: Hex;
}

// Morpho Blue venue payloads are `abi.encode(MarketParams)` — `keccak256(data)` is the Morpho
// market id. All three below use the adaptive curve IRM and an 86% lltv.

// Morpho market 0x3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49.
const MORPHO_WBTC_USDC_DATA: Hex =
  "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000002260fac5e5542a773aa44fbcfedf7c193bc2c599000000000000000000000000dddd770badd886df3864029e4b377b5f6a2b6b83000000000000000000000000870ac11d48b15db9a138cf899d20f13f79ba00bc0000000000000000000000000000000000000000000000000bef55718ad60000";

// Morpho market 0x64d65c9a2d91c36d56fbc42d69e979335320169b3df63bf92789e2c8883fcc64.
const MORPHO_CBBTC_USDC_DATA: Hex =
  "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000cbb7c0000ab88b473b1f5afd9ef808440eed33bf000000000000000000000000a6d6950c9f177f1de7f7757fb33539e3ec60182a000000000000000000000000870ac11d48b15db9a138cf899d20f13f79ba00bc0000000000000000000000000000000000000000000000000bef55718ad60000";

// Morpho market 0xe7e9694b754c4d4f7e21faf7223f6fa71abaeb10296a4c43a54a7977149687d2.
const MORPHO_WSTETH_USDT_DATA: Hex =
  "0x000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec70000000000000000000000007f39c581f595b53c5cb19bd0b3f8da6c935e2ca000000000000000000000000095db30fab9a3754e42423000df27732cb2396992000000000000000000000000870ac11d48b15db9a138cf899d20f13f79ba00bc0000000000000000000000000000000000000000000000000bef55718ad60000";

// Fields guaranteed on every supported chain. Names key the records so consumers pick venues,
// BLMs, and market payloads by name; ids and payloads stay chain-specific (venue ids are not
// guaranteed consistent across chains).
interface ChainRegistryBase {
  /** Block at which Iris was deployed; lower bound for config event scans. */
  readonly deploymentBlock: bigint;
  /** WAD-scaled bond LLTVs accepted by `take` (as carried by `quote.bondLltv`). */
  readonly bondLltvs: readonly bigint[];
  /** Enabled BLMs by name. */
  readonly blms: Readonly<Record<string, Address>>;
  /** Registered venue ids by name (`venueId < 128`). */
  readonly venues: Readonly<Record<string, bigint>>;
  /** Enabled market data payloads by label. */
  readonly marketDatas: Readonly<Record<string, MarketData>>;
}

// Enforces the base shape on every chain while preserving each chain's exact entries (via the
// `const` type parameter), so `getChainRegistry` returns a precise per-chain type — including
// compile-time venue-name lookups — instead of widened records.
const defineChainRegistries = <const T extends Record<ChainId, ChainRegistryBase>>(
  registries: T,
): T => registries;

export const CHAIN_REGISTRIES = defineChainRegistries({
  [ChainId.EthMainnet]: {
    deploymentBlock: 25_442_833n,
    bondLltvs: [900_000_000_000_000_000n],
    // `whitelistBlm` is deployed but not enabled yet.
    blms: { blm: CHAIN_ADDRESSES[ChainId.EthMainnet].blm },
    venues: { aaveV3: 0n, morphoBlue: 1n },
    marketDatas: {
      // The Aave v3 adapter ignores the payload; the enabled hash is `keccak256("0x")`.
      aaveV3: { venue: "aaveV3", data: "0x" },
      "morphoBlue:WBTC/USDC": { venue: "morphoBlue", data: MORPHO_WBTC_USDC_DATA },
      "morphoBlue:cbBTC/USDC": { venue: "morphoBlue", data: MORPHO_CBBTC_USDC_DATA },
      "morphoBlue:wstETH/USDT": { venue: "morphoBlue", data: MORPHO_WSTETH_USDT_DATA },
    },
  },
  // Fork of mainnet, but with its own Iris deployment: the enabled configuration is set
  // separately and does not track mainnet's.
  [ChainId.VNet]: {
    deploymentBlock: 25_644_062n,
    bondLltvs: [800_000_000_000_000_000n],
    // `whitelistBlm` is deployed but not enabled yet.
    blms: { blm: CHAIN_ADDRESSES[ChainId.VNet].blm },
    venues: { aaveV3: 0n, morphoBlue: 1n },
    marketDatas: {
      aaveV3: { venue: "aaveV3", data: "0x" },
      "morphoBlue:WBTC/USDC": { venue: "morphoBlue", data: MORPHO_WBTC_USDC_DATA },
      "morphoBlue:cbBTC/USDC": { venue: "morphoBlue", data: MORPHO_CBBTC_USDC_DATA },
      "morphoBlue:wstETH/USDT": { venue: "morphoBlue", data: MORPHO_WSTETH_USDT_DATA },
    },
  },
});

/** Registry for an unspecified chain; only fields common to every chain are accessible without
 * first narrowing the chain id. */
export type ChainRegistry = (typeof CHAIN_REGISTRIES)[ChainId];

export const getChainRegistry = <T extends ChainId>(chainId: T): (typeof CHAIN_REGISTRIES)[T] => {
  const chainRegistry = CHAIN_REGISTRIES[chainId];
  if (chainRegistry == null) throw new UnsupportedChainIdError(chainId);

  return chainRegistry;
};

import type { Address, Client } from "viem";
import type { FetchParameters } from "../../types.js";

import { readContract } from "viem/actions";
import { blmAbi } from "../../abis/blm.js";
import { whitelistBlmAbi } from "../../abis/whitelistBlm.js";
import { Blm } from "./Blm.js";

/**
 * Fetches a BLM's bond parameters for one debt token.
 *
 * `Blm` and `WhitelistBlm` expose the same `slope`/`intercept` getters, so this fetcher works
 * with either flavor. Both reads are issued concurrently and target `blm` directly — no chain
 * registry lookup, so calls coalesce into the caller's multicall batch even when
 * `parameters.chainId` is omitted (it is unused). The hydrated entity computes a quote's
 * required bond via `Blm.bondRequirement` without a `bondRequirement` contract call.
 *
 * The entity's `whitelist` is offline data, not fetched: callers holding one (e.g. from the
 * indexer) attach it afterwards — `blm.whitelist = whitelist`.
 *
 * @param blm - BLM address (e.g. `quote.blm`).
 * @param token - Debt token address.
 * @param client - Viem client used for the reads.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @returns The hydrated `Blm` entity.
 * @example
 * ```ts
 * import { fetchBlm } from "@iris-credit/core-sdk";
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 *
 * const blm = await fetchBlm(quote.blm, quote.debtToken, client);
 * const requiredBond = blm.bondRequirement(quote);
 * ```
 */
export async function fetchBlm(
  blm: Address,
  token: Address,
  client: Client,
  parameters: FetchParameters = {},
) {
  const call = { ...parameters, address: blm, abi: blmAbi } as const;

  const [slope, intercept] = await Promise.all([
    readContract(client, { ...call, functionName: "slope", args: [token] }),
    readContract(client, { ...call, functionName: "intercept", args: [token] }),
  ]);

  return new Blm({ address: blm, token, slope, intercept });
}

/**
 * Fetches whether an account is whitelisted on a whitelist-flavor BLM.
 *
 * `WhitelistBlm.bondRequirement` reverts for quotes whose solver is not whitelisted, so a quote
 * referencing a whitelist-flavor BLM is unsubmittable unless this returns `true` for
 * `quote.solver`. The read targets `blm` directly — no chain registry lookup, so the call
 * coalesces into the caller's multicall batch even when `parameters.chainId` is omitted (it is
 * unused). Plain `Blm` deployments have no `isWhitelisted` getter and make this fetcher throw.
 *
 * @param blm - Whitelist-flavor BLM address.
 * @param account - Account to look up (e.g. `quote.solver`).
 * @param client - Viem client used for the read.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @returns Whether `account` is whitelisted on `blm`.
 */
export async function fetchIsWhitelisted(
  blm: Address,
  account: Address,
  client: Client,
  parameters: FetchParameters = {},
) {
  return await readContract(client, {
    ...parameters,
    address: blm,
    abi: whitelistBlmAbi,
    functionName: "isWhitelisted",
    args: [account],
  });
}

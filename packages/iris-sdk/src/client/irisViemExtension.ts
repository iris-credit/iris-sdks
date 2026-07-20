import type { Client } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type { IrisClientType } from "../types/index.js";

import { deepFreeze } from "@iris-credit/iris-ts";
import { Iris } from "../entities/iris.js";

/**
 * Builds the stateless `iris` namespace exposed on an extended viem client. Wraps the supplied
 * viem `Client` plus a frozen options bag and exposes the chain-scoped entity factory.
 *
 * Holds no state beyond configuration: no cache, no `init()`, no warm-up. Each factory call
 * (`core`) returns a fresh entity bound to this client.
 *
 * @internal
 */
function createIrisNamespace(
  viemClient: Client,
  options?: { readonly supportSignature?: boolean },
): IrisClientType {
  const namespace: IrisClientType = {
    viemClient,
    options: deepFreeze({
      supportSignature: options?.supportSignature ?? false,
    }),

    core(chainId: ChainId) {
      return new Iris(namespace, chainId);
    },
  };

  return namespace;
}

/**
 * Returns a viem `extend(...)` function that adds a stateless `iris` namespace to a viem client.
 * The namespace rides on top of the same client (one transport / chain / account) and exposes the
 * chain-scoped entity factory under `client.iris`, so reads and writes share one client.
 *
 * @param _options - Optional SDK-wide options forwarded to the `iris` namespace.
 * @param _options.supportSignature - Whether the integrator can collect EIP-712 signatures for
 *   permit / permit2. Defaults to `false` (classic approvals only).
 * @returns A viem extension function — `client.extend(irisViemExtension(...))` adds `client.iris`.
 * @example
 * ```ts
 * import { createWalletClient, http, publicActions } from "viem";
 * import { mainnet } from "viem/chains";
 * import { irisViemExtension } from "@iris-credit/iris-sdk";
 *
 * const client = createWalletClient({
 *   chain: mainnet,
 *   transport: http(),
 *   account: user,
 * })
 *   .extend(publicActions)
 *   .extend(irisViemExtension({ supportSignature: true }));
 *
 * const iris = client.iris.core(1);
 * const { buildTx, getRequirements } = iris.take({ userAddress: user, quote, quoteSignature });
 * const requirements = await getRequirements();
 * // ...satisfy requirements (send approvals / collect signatures)...
 * const tx = buildTx();
 * ```
 */
export function irisViemExtension(_options?: { readonly supportSignature?: boolean }) {
  return <TClient extends Client>(client: TClient) => {
    return {
      iris: createIrisNamespace(client, _options),
    };
  };
}

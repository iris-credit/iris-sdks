import type { Hex, WalletClient } from "viem";
import type { ChainId, Quote } from "@iris-credit/core-sdk";
import type { SolverPermit2 } from "../../types/index.js";

import { signQuote } from "./signQuote.js";
import { signSolverPermit2 } from "./signSolverPermit2.js";

/** Parameters for {@link signResponse}. */
export interface SignResponseParams {
  /** Target chain id; must match `client.chain.id`. */
  chainId: ChainId;
  /** The complete quote to sign — `quote.solver` must be the connected account. */
  quote: Quote;
  /**
   * Funding mode. `false` (default) signs the quote only — for solvers holding a standing
   * allowance to the Iris core. `true` also signs the per-quote Permit2 bond funding payload.
   */
  usePermit2?: boolean;
}

/**
 * Signs everything a quote response carries — the solver bot's per-quote hot path, composing
 * {@link signQuote} and (in the `usePermit2` mode) {@link signSolverPermit2} in one call.
 *
 * The bond funding payload is derived from the quote itself (`solver`, `debtToken`, `bond`),
 * so it can never mismatch the quote it accompanies, and its allowance `expiration` is set to
 * `quote.deadline` — an unfilled quote's permit dies with the quote, leaving nothing behind.
 * The two signatures are produced in parallel.
 *
 * @param client - Wallet client whose account is `quote.solver`; its transport must support
 *   `eth_call` (ERC-1271-capable verification and the Permit2 nonce read).
 * @param params - See {@link SignResponseParams}.
 * @returns The quote signature, plus the {@link SolverPermit2} payload in the `usePermit2`
 *   mode — attach both to the RFQ webhook response.
 * @throws {ChainIdMismatchError} when `client.chain?.id !== params.chainId`.
 * @throws {MissingClientPropertyError} when the client has no `account.address`.
 * @throws {AddressMismatchError} when the client account differs from `quote.solver`.
 * @throws {NonPositiveInputError} in the `usePermit2` mode when `quote.bond` is not positive.
 * @throws {InvalidSignatureError} when EIP-712 verification fails.
 * @example
 * ```ts
 * import { signResponse } from "@iris-credit/iris-sdk";
 *
 * const { quoteSignature, solverPermit2 } = await signResponse(client, {
 *   chainId: 1,
 *   quote,
 *   usePermit2: true,
 * });
 * // Respond to the RFQ webhook with { ...quote fields, signature: quoteSignature, solverPermit2 }.
 * ```
 */
export const signResponse = async (
  client: WalletClient,
  params: SignResponseParams,
): Promise<{ quoteSignature: Hex; solverPermit2?: SolverPermit2 }> => {
  const { chainId, quote, usePermit2 } = params;

  const [quoteSignature, solverPermit2] = await Promise.all([
    signQuote(client, { chainId, quote }),
    usePermit2
      ? signSolverPermit2(client, {
          chainId,
          solver: quote.solver,
          debtToken: quote.debtToken,
          bond: quote.bond,
          expiration: quote.deadline,
        })
      : undefined,
  ]);

  return { quoteSignature, solverPermit2 };
};

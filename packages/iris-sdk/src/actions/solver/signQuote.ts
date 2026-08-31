import type { Hex, WalletClient } from "viem";
import type { ChainId, Quote } from "@iris-credit/core-sdk";

import { signTypedData, verifyTypedData } from "viem/actions";
import { getQuoteTypedData } from "@iris-credit/core-sdk";
import { validateChainId, validateUserAddress } from "../../helpers/index.js";
import { InvalidSignatureError } from "../../types/index.js";

/** Parameters for {@link signQuote}. */
export interface SignQuoteParams {
  /** Target chain id; must match `client.chain.id` (the EIP-712 domain binds it). */
  chainId: ChainId;
  /** The complete quote to sign — signed verbatim, with `quote.solver` as the signer. */
  quote: Quote;
}

/**
 * Signs a quote as the solver — the maker-flow signature every RFQ response carries and
 * `Iris.take` verifies on-chain.
 *
 * Signs the input verbatim: filling `nonce` (e.g. `randomNonce()`) and `deadline` is the
 * caller's job before signing, since the signature binds every field. The RFQ only accepts
 * deadlines near `now + QUOTE_TTL`, so stamp them at response time. Attach the returned
 * signature to the webhook response next to the quote (and, for solvers without a standing
 * allowance, the `signSolverPermit2` payload).
 *
 * @param client - Wallet client whose account is `quote.solver`; also used for
 *   ERC-1271-capable signature verification, so its transport must support `eth_call`.
 * @param params - See {@link SignQuoteParams}.
 * @returns The solver's EIP-712 signature over the quote.
 * @throws {ChainIdMismatchError} when `client.chain?.id !== params.chainId`.
 * @throws {MissingClientPropertyError} when the client has no `account.address`.
 * @throws {AddressMismatchError} when the client account differs from `quote.solver`.
 * @throws {InvalidSignatureError} when EIP-712 verification fails.
 * @example
 * ```ts
 * import { QUOTE_TTL, randomNonce } from "@iris-credit/core-sdk";
 * import { Time } from "@iris-credit/iris-ts";
 * import { signQuote } from "@iris-credit/iris-sdk";
 *
 * const quote = {
 *   ...terms,
 *   deadline: Time.timestamp() + QUOTE_TTL,
 *   nonce: randomNonce(),
 * };
 * const quoteSignature = await signQuote(client, { chainId: 1, quote });
 * // Respond to the RFQ webhook with { ...quote fields, signature: quoteSignature }.
 * ```
 */
export const signQuote = async (client: WalletClient, params: SignQuoteParams): Promise<Hex> => {
  const { chainId, quote } = params;

  validateChainId(client.chain?.id, chainId);

  const account = client.account;
  validateUserAddress(account?.address, quote.solver);

  const typedData = getQuoteTypedData(chainId, quote);
  const signature = await signTypedData(client, {
    ...typedData,
    account,
  });

  const isValid = await verifyTypedData(client, {
    ...typedData,
    address: quote.solver,
    signature,
  });

  if (!isValid) {
    throw new InvalidSignatureError();
  }

  return signature;
};

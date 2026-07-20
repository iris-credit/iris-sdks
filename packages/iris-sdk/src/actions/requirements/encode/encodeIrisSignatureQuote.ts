import type { Address, Client, WalletClient } from "viem";
import type { ChainId, Quote } from "@iris-credit/core-sdk";
import type {
  QuoteRequirementSignature,
  QuoteSignatureAction,
  Requirement,
} from "../../../types/index.js";

import { signTypedData, verifyTypedData } from "viem/actions";
import { getQuoteTypedData } from "@iris-credit/core-sdk";
import { deepFreeze } from "@iris-credit/iris-ts";
import { validateUserAddress } from "../../../helpers/index.js";
import { ChainIdMismatchError, InvalidSignatureError } from "../../../types/index.js";

/** Parameters for {@link encodeIrisSignatureQuote}. */
interface EncodeIrisSignatureQuoteParams {
  /** Fully-populated quote struct the solver commits to (WAD units, explicit deadline/nonce). */
  quote: Quote;
  /** Target chain id; must match `viemClient.chain.id`. */
  chainId: ChainId;
}

/**
 * Builds the maker flow's EIP-712 `Quote` signature `Requirement`.
 *
 * The returned `Requirement.sign()` must be called with the solver account (`quote.solver`): it
 * signs `core-sdk`'s `Quote` typed data and verifies the signature against `quote.solver` through
 * the client before returning — ECDSA and ERC-1271 (contract-wallet solvers) both pass, and a
 * signature that does not verify never leaves the SDK. The signed payload is distributed
 * off-chain via the RFQ and later consumed on-chain by `Iris.take(quote, signature)`.
 *
 * @param viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId` (used for
 *   ERC-1271-capable signature verification).
 * @param params - Quote signature encoding parameters.
 * @param params.quote - The quote struct to sign.
 * @param params.chainId - Target chain id.
 * @returns A `Requirement` whose `sign(client, userAddress)` produces the deep-frozen signature.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`.
 * @throws {MissingClientPropertyError} from `sign()` when the client has no `account.address`.
 * @throws {AddressMismatchError} from `sign()` when the client account differs from `userAddress`.
 * @throws {InvalidSignatureError} from `sign()` when the signature does not verify against
 *   `quote.solver` (including when `userAddress` is not the solver).
 * @example
 * ```ts
 * import { encodeIrisSignatureQuote } from "@iris-credit/iris-sdk";
 *
 * const requirement = encodeIrisSignatureQuote(client, { quote, chainId: 1 });
 * const signed = await requirement.sign(walletClient, quote.solver);
 * // signed.args satisfies { solver, quote, signature }
 * ```
 */
export const encodeIrisSignatureQuote = (
  viemClient: Client,
  params: EncodeIrisSignatureQuoteParams,
): Requirement<QuoteRequirementSignature> => {
  const { quote, chainId } = params;

  if (viemClient.chain?.id !== chainId) {
    throw new ChainIdMismatchError(viemClient.chain?.id, chainId);
  }

  const action: QuoteSignatureAction = {
    type: "quoteSignature",
    args: { solver: quote.solver, nonce: quote.nonce, deadline: quote.deadline },
  };

  return {
    action,
    async sign(client: WalletClient, userAddress: Address) {
      const account = client.account;
      validateUserAddress(account?.address, userAddress);

      const typedData = getQuoteTypedData(chainId, quote);

      const signature = await signTypedData(client, {
        ...typedData,
        account,
      });

      const isValid = await verifyTypedData(viemClient, {
        ...typedData,
        address: quote.solver, // Verify against the solver (ECDSA or ERC-1271).
        signature,
      });

      if (!isValid) {
        throw new InvalidSignatureError();
      }

      return deepFreeze({
        args: {
          solver: quote.solver,
          quote,
          signature,
        },
        action,
      });
    },
  };
};

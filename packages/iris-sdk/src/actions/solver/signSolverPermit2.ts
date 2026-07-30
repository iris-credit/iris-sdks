import type { Address, WalletClient } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type { SolverPermit2 } from "../../types/index.js";

import { readContract, signTypedData, verifyTypedData } from "viem/actions";
import {
  getChainAddresses,
  getPermit2PermitTypedData,
  MathLib,
  permit2Abi,
} from "@iris-credit/core-sdk";
import { deepFreeze } from "@iris-credit/iris-ts";
import { validateUserAddress } from "../../helpers/index.js";
import {
  ChainIdMismatchError,
  InvalidSignatureError,
  NonPositiveInputError,
} from "../../types/index.js";

/** Fixed allowance expiration — once submitted, the permit mimics a standing approval. */
const EXPIRATION = Number(MathLib.MAX_UINT_48);

/** Parameters for {@link signSolverPermit2}. */
export interface SignSolverPermit2Params {
  /** The solver signing the payload; must be the connected account. */
  solver: Address;
  /** The debt token the bond is pulled in. */
  debtToken: Address;
  /** The bond amount the permit covers. */
  bond: bigint;
  /** Target chain id; must match `client.chain.id`. */
  chainId: ChainId;
  /**
   * Permit2 signature deadline in seconds — the last moment the signed permit can be
   * submitted on-chain (`signResponse` passes `quote.deadline`).
   */
  deadline: bigint;
  /** Defaults to the solver's current on-chain Permit2 nonce for `(debtToken, Iris core)`. */
  nonce?: bigint;
}

/**
 * Signs the solver-side Permit2 payload funding a quote's bond pull, for delivery with the
 * quote through the RFQ.
 *
 * The maker-flow counterpart of the taker's requirement signing: a solver bot that holds no
 * standing allowance to the Iris core signs this per quote and attaches it to its webhook
 * response next to the signed quote. The take bundle then submits it via `approve2Iris`, so
 * `Iris.take`'s `safeTransferFrom2` bond pull succeeds through the Permit2 fallback. The
 * signed spender is pinned to the chain's Iris core — never `GeneralAdapter1`.
 *
 * The signed allowance `expiration` is fixed to `MathLib.MAX_UINT_48`: `deadline` bounds how long
 * the signature stays submittable, and once submitted the allowance never expires, mimicking a
 * standing approval.
 *
 * Prerequisite: the solver must have a standing ERC-20 approval of `debtToken` to the Permit2
 * contract (one-time `approve(permit2, max)`); the taker-side pre-flight checks it.
 *
 * Permit2 nonces for `(solver, debtToken, Iris)` are sequential: each consumed permit
 * increments the on-chain nonce, so concurrent outstanding quotes sharing a nonce race — only
 * the first take can consume its permit. Solvers quoting at volume should prefer a standing
 * allowance and skip this payload entirely.
 *
 * @param client - Wallet client whose account is the solver; also used for ERC-1271-capable
 *   signature verification, so its transport must support `eth_call`.
 * @param params - See {@link SignSolverPermit2Params}.
 * @returns A deep-frozen {@link SolverPermit2} ready to attach to the RFQ quote response.
 * @throws {ChainIdMismatchError} when `client.chain?.id !== params.chainId`.
 * @throws {NonPositiveInputError} when `params.bond` is not positive.
 * @throws {MissingClientPropertyError} when the client has no `account.address`.
 * @throws {AddressMismatchError} when the client account differs from `params.solver`.
 * @throws {InvalidSignatureError} when EIP-712 verification fails.
 * @example
 * ```ts
 * import { signSolverPermit2 } from "@iris-credit/iris-sdk";
 *
 * const solverPermit2 = await signSolverPermit2(client, {
 *   chainId: 1,
 *   solver,
 *   debtToken,
 *   bond,
 *   deadline,
 * });
 * // Attach to the RFQ webhook response next to the signed quote.
 * ```
 */
export const signSolverPermit2 = async (
  client: WalletClient,
  params: SignSolverPermit2Params,
): Promise<SolverPermit2> => {
  const { solver, debtToken, bond, chainId, deadline } = params;

  if (client.chain?.id !== chainId) {
    throw new ChainIdMismatchError(client.chain?.id, chainId);
  }

  if (bond <= 0n) {
    throw new NonPositiveInputError("bond", bond);
  }

  const account = client.account;
  validateUserAddress(account?.address, solver);

  const { iris, permit2 } = getChainAddresses(chainId);

  const nonce =
    params.nonce ??
    BigInt(
      (
        await readContract(client, {
          abi: permit2Abi,
          address: permit2,
          functionName: "allowance",
          args: [solver, debtToken, iris],
        })
      )[2],
    );

  const permitSingle = {
    details: {
      token: debtToken,
      amount: bond,
      expiration: EXPIRATION,
      nonce: Number(nonce),
    },
    sigDeadline: deadline,
  };

  const typedData = getPermit2PermitTypedData(
    {
      erc20: debtToken,
      allowance: bond,
      nonce: Number(nonce),
      deadline,
      spender: iris,
      expiration: EXPIRATION,
    },
    chainId,
  );
  const signature = await signTypedData(client, {
    ...typedData,
    account,
  });

  const isValid = await verifyTypedData(client, {
    ...typedData,
    address: solver,
    signature,
  });

  if (!isValid) {
    throw new InvalidSignatureError();
  }

  return deepFreeze({ permitSingle, signature });
};

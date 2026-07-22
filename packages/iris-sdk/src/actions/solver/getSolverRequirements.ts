import type { Address, Client } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type { ERC20ApprovalAction, Transaction } from "../../types/index.js";

import { erc20Abi, maxUint256 } from "viem";
import { readContract } from "viem/actions";
import { getChainAddresses, MathLib } from "@iris-credit/core-sdk";
import { ChainIdMismatchError, ZeroBondAmountError } from "../../types/index.js";
import { getRequirementsApproval } from "../requirements/getRequirementsApproval.js";

/** Parameters for {@link getSolverRequirements}. */
export interface GetSolverRequirementsParams {
  /** Target chain id; must match `viemClient.chain.id`. */
  chainId: ChainId;
  /** The solver whose bond funding is checked. */
  solver: Address;
  /** The debt token bonds are pulled in. */
  debtToken: Address;
  /** The bond amount the solver must be able to fund. */
  bond: bigint;
  /**
   * Funding mode. `false` (default) resolves the standing-allowance mode: a direct ERC-20
   * approval to the Iris core. `true` resolves the per-quote `signSolverPermit2` mode: an
   * ERC-20 approval to the Permit2 contract.
   */
  usePermit2?: boolean;
}

/**
 * Resolves the approvals a solver must satisfy before quoting — the maker-flow counterpart of
 * the taker's `getGeneralAdapterRequirements`.
 *
 * `Iris.take` pulls the bond from the solver via `safeTransferFrom2`. Reads the minimum
 * allowance state for the chosen funding mode, then picks one of two flows:
 *
 * 1. **Default** — standing-allowance mode: a direct ERC-20 approval to the Iris core (or no-op
 *    when the existing allowance already covers `bond`).
 * 2. **`usePermit2: true`** — per-quote `signSolverPermit2` mode: an ERC-20 approval to the
 *    Permit2 contract; the Permit2-managed allowance itself is granted in-bundle by each signed
 *    payload, so it is never required here.
 *
 * Requirements cover allowances only — gate quoting on the solver's debt-token balance
 * separately (`balanceOf(solver) >= bond`); a shortfall is fixed by funding the wallet, not by
 * an approval. No other layer verifies solver funding before the take executes, so a bot
 * should call this at startup and re-check as takes consume its funding.
 *
 * @param viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId`.
 * @param params - See {@link GetSolverRequirementsParams}.
 * @returns The approval transactions the solver must send. Empty when the chosen mode is
 *   already funded.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`.
 * @throws {ZeroBondAmountError} when `params.bond` is zero.
 * @example
 * ```ts
 * import { getSolverRequirements } from "@iris-credit/iris-sdk";
 *
 * // Bot startup: send the one-time approvals for the chosen funding mode.
 * const requirements = await getSolverRequirements(client, {
 *   chainId: 1,
 *   solver,
 *   debtToken,
 *   bond: maxQuoteSize,
 *   usePermit2: true,
 * });
 * for (const tx of requirements) await client.sendTransaction(tx);
 * ```
 */
export const getSolverRequirements = async (
  viemClient: Client,
  params: GetSolverRequirementsParams,
): Promise<Readonly<Transaction<ERC20ApprovalAction>>[]> => {
  const { chainId, solver, debtToken, bond, usePermit2 } = params;

  if (viemClient.chain?.id !== chainId) {
    throw new ChainIdMismatchError(viemClient.chain?.id, chainId);
  }

  if (bond <= 0n) {
    throw new ZeroBondAmountError(debtToken);
  }

  const { iris, permit2 } = getChainAddresses(chainId);

  if (usePermit2) {
    const permit2Erc20Allowance = await readContract(viemClient, {
      abi: erc20Abi,
      address: debtToken,
      functionName: "allowance",
      args: [solver, permit2],
    });

    return getRequirementsApproval({
      address: debtToken,
      chainId,
      args: {
        // Permit2 transfers cap amounts at uint160; approve infinite once, like the taker's
        // Permit2 prerequisite.
        approvalAmount: MathLib.MAX_UINT_160,
        spendAmount: bond,
        spender: permit2,
      },
      allowances: permit2Erc20Allowance,
    });
  }

  const allowance = await readContract(viemClient, {
    abi: erc20Abi,
    address: debtToken,
    functionName: "allowance",
    args: [solver, iris],
  });

  return getRequirementsApproval({
    address: debtToken,
    chainId,
    args: {
      // Standing funding allowance consumed take after take; the encoder caps it per-token.
      approvalAmount: maxUint256,
      spendAmount: bond,
      spender: iris,
    },
    allowances: allowance,
  });
};

import type { Address, Client } from "viem";
import type { ChainId } from "@iris-credit/core-sdk";
import type {
  Bundler3TokenSignatureRequirement,
  ERC20ApprovalAction,
  Transaction,
} from "../../../types/index.js";

import { erc20Abi } from "viem";
import { readContract } from "viem/actions";
import { getChainAddresses, permit2Abi } from "@iris-credit/core-sdk";
import { ChainIdMismatchError } from "../../../types/index.js";
import { getRequirementsApproval } from "../getRequirementsApproval.js";
import { getGeneralAdapterRequirementsPermit2 } from "./getGeneralAdapterRequirementsPermit2.js";

/** Parameters for {@link getGeneralAdapterRequirements}. */
export type GetGeneralAdapterRequirementsParams = {
  address: Address;
  chainId: ChainId;
  args: { amount: bigint; from: Address };
  /**
   * Whether the integrator can collect a signature. When `true`, the Permit2 flow is used;
   * when `false`, a classic ERC-20 approval transaction is emitted instead.
   */
  supportSignature: boolean;
};

/**
 * Resolves the approval requirements an integrator must satisfy before a bundled action pulls
 * tokens through `GeneralAdapter1`.
 *
 * Reads the minimum token allowance / nonce state needed from the chain, then picks one of two
 * flows:
 *
 * 1. **`supportSignature: false`** — classic ERC-20 `approve` transaction (or no-op when the
 *    direct allowance is already large enough).
 * 2. **`supportSignature: true`** — Permit2 flow: classic approval to the Permit2 contract
 *    (if needed), followed by a Permit2 signature against `GeneralAdapter1`.
 *
 * EIP-2612 simple permits are deliberately not supported: Permit2 needs no per-token domain
 * metadata (name / version) or compatibility probing, so every signature-capable path routes
 * through Permit2 uniformly.
 *
 * @param viemClient - Connected viem `Client` whose `chain.id` matches `params.chainId`.
 * @param params - Requirement resolution parameters.
 * @param params.address - ERC-20 token address.
 * @param params.chainId - Chain id; must match `viemClient.chain.id`.
 * @param params.args.amount - Required token amount. Returns `[]` when zero.
 * @param params.args.from - Account that will grant the approval.
 * @param params.supportSignature - Whether the integrator can collect a signature; controls
 *   Permit2 vs. classic approval.
 * @returns Promise resolving to an array of either deep-frozen approval transactions or
 *   `Requirement` objects (signature requirements with a `sign()` method). Empty when `amount`
 *   is zero or when the classic-approval path can reuse sufficient direct allowance.
 * @throws {ChainIdMismatchError} when `viemClient.chain?.id !== params.chainId`. No other typed
 *   error is reachable through this entry point: the values passed into
 *   `getRequirementsApproval` always satisfy `approvalAmount >= spendAmount` (direct path uses
 *   `approvalAmount === spendAmount === amount`; Permit2 path uses `MAX_UINT_160`), so
 *   `ApprovalAmountLessThanSpendAmountError` cannot fire from here.
 * @example
 * ```ts
 * import { createPublicClient, http } from "viem";
 * import { mainnet } from "viem/chains";
 * import { getGeneralAdapterRequirements } from "@iris-credit/iris-sdk";
 *
 * const client = createPublicClient({ chain: mainnet, transport: http() });
 * const requirements = await getGeneralAdapterRequirements(client, {
 *   address: USDC,
 *   chainId: 1,
 *   supportSignature: true,
 *   args: { amount: 1_000_000n, from: user },
 * });
 * // requirements satisfies (Readonly<Transaction<ERC20ApprovalAction>> | Bundler3TokenSignatureRequirement)[]
 * ```
 */
export const getGeneralAdapterRequirements = async (
  viemClient: Client,
  params: GetGeneralAdapterRequirementsParams,
): Promise<(Readonly<Transaction<ERC20ApprovalAction>> | Bundler3TokenSignatureRequirement)[]> => {
  const {
    address,
    chainId,
    supportSignature,
    args: { amount, from },
  } = params;

  if (viemClient.chain?.id !== chainId) {
    throw new ChainIdMismatchError(viemClient.chain?.id, chainId);
  }

  if (amount === 0n) {
    return [];
  }

  const {
    permit2,
    bundler3: { generalAdapter1 },
  } = getChainAddresses(chainId);
  if (supportSignature && permit2) {
    // Do not check the existing Permit2-managed amount/expiration. Permit2 allowance signatures
    // overwrite the tuple, and the bundle spends exactly `amount`, so a fresh exact signature
    // leaves no residual Permit2 allowance. The tuple is still read because Permit2 requires
    // its nonce in the signed allowance payload.
    const [permit2Erc20Allowance, [, , permit2Nonce]] = await Promise.all([
      readContract(viemClient, {
        abi: erc20Abi,
        address,
        functionName: "allowance",
        args: [from, permit2],
      }),
      readContract(viemClient, {
        abi: permit2Abi,
        address: permit2,
        functionName: "allowance",
        args: [from, address, generalAdapter1],
      }),
    ]);

    return getGeneralAdapterRequirementsPermit2(viemClient, {
      address,
      chainId,
      permit2,
      args: { amount },
      erc20Allowances: { permit2: permit2Erc20Allowance },
      permit2Nonce: BigInt(permit2Nonce),
    });
  }

  const generalAdapterAllowance = await readContract(viemClient, {
    abi: erc20Abi,
    address,
    functionName: "allowance",
    args: [from, generalAdapter1],
  });

  return getRequirementsApproval({
    address,
    chainId,
    args: {
      spendAmount: amount,
      approvalAmount: amount,
      spender: generalAdapter1,
    },
    allowances: generalAdapterAllowance,
  });
};

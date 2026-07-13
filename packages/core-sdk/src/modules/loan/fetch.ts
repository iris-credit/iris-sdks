import type { Address, Client } from "viem";
import type { FetchParameters } from "../../types.js";

import { getAddress } from "viem";
import { getChainId, readContract } from "viem/actions";
import { irisAbi } from "../../abis/iris.js";
import { getChainAddresses } from "../../addresses.js";
import { ChainUtils } from "../../chain.js";
import { BP } from "../../constants.js";
import { UnsupportedChainIdError } from "../../errors.js";
import { Loan } from "./Loan.js";

/**
 * Fetches an Iris loan by Pod address.
 *
 * The contract stores rates, bond LLTV, and fee as BP-compressed `uint16` values. This fetcher
 * restores them to the WAD-scaled convention used by `Loan` and the indexer.
 *
 * @param pod - Pod address identifying the loan.
 * @param client - Viem client used for the contract read.
 * @param parameters.blockNumber - Optional block number for historical reads.
 * @param parameters.blockTag - Optional block tag for historical reads.
 * @param parameters.stateOverride - Optional viem state override.
 * @param parameters.chainId - Optional chain id; defaults to `getChainId(client)`.
 * @returns The hydrated `Loan` entity.
 */
export async function fetchLoan(pod: Address, client: Client, parameters: FetchParameters = {}) {
  const chainId = parameters.chainId ?? (await getChainId(client));
  if (!ChainUtils.isSupportedChainId(chainId)) throw new UnsupportedChainIdError(chainId);

  const { iris } = getChainAddresses(chainId);
  const loan = await readContract(client, {
    ...parameters,
    address: iris,
    abi: irisAbi,
    functionName: "getLoan",
    args: [getAddress(pod)],
  });

  return new Loan({
    ...loan,
    maturity: BigInt(loan.maturity),
    overduePeriod: BigInt(loan.overduePeriod),
    fixedRate: BigInt(loan.fixedRate) * BP,
    overdueRate: BigInt(loan.overdueRate) * BP,
    bondLltv: BigInt(loan.bondLltv) * BP,
    fee: BigInt(loan.fee) * BP,
  });
}

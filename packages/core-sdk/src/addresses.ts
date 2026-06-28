import type { Address } from "viem";

import { ChainId } from "./chain.js";

// Permit2 is deployed at the same canonical address on every chain.
const PERMIT2_ADDRESS: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

export interface ChainAddresses {
  readonly iris: Address;
  readonly permit2: Address;
}

export const CHAIN_ADDRESSES = {
  [ChainId.EthMainnet]: {
    // TODO: Iris is not yet deployed to mainnet. Replace with the deployed address.
    iris: "0x0000000000000000000000000000000000000000",
    permit2: PERMIT2_ADDRESS,
  },
} satisfies Record<ChainId, ChainAddresses>;

export const getChainAddresses = (chainId: ChainId): ChainAddresses => {
  return CHAIN_ADDRESSES[chainId];
};

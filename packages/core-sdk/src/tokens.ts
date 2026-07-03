import type { Address } from "viem";
import type { ChainId } from "./chain.js";

export type Token = {
  chainId: ChainId;
  address: Address;
  symbol: string;
  decimals: number;
  logoURI: string;
  priceUsd?: number;
};

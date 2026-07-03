import type { Address } from "viem";

export type Token = {
  address: Address;
  symbol: string;
  decimals: number;
  logoURI: string;
  priceUsd?: number;
};

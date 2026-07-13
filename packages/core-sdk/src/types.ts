import type { CallParameters, UnionPick } from "viem";
import type { ChainId } from "./chain.js";

/** The id of a market used on the core contract */
export type MarketId = `0x${string}` & { readonly __TYPE__: "marketId" };

export type BigIntish = bigint | string | number | boolean;

/** Common viem call parameters accepted by core-sdk fetchers. */
export type FetchParameters = UnionPick<
  CallParameters,
  "blockNumber" | "blockTag" | "stateOverride"
> & {
  chainId?: ChainId;
};

export type Loadable<T> = T | undefined;
export type Failable<T> = T | null;
export type Fetchable<T> = Failable<Loadable<T>>;

export const isMarketId = (value: unknown): value is MarketId => {
  return typeof value === "string" && /^0x[0-9A-Fa-f]{64}$/.test(value);
};
